import mongoose from "mongoose";
import { connectToDatabase } from "../db/mongodb.js";
import Project, {
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  PROJECT_PRIORITIES,
} from "../../models/Project.js";
import Task from "../../models/Task.js";
import Milestone from "../../models/Milestone.js";
import { SORTABLE_FIELDS } from "./project-validation.js";
import {
  calculateProjectProgress,
  calculateMilestoneStats,
} from "../utils/project-progress.js";

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * Retrieves a paginated, filtered, owner-scoped list of projects with task-driven progress calculation.
 *
 * @param {object} options
 * @param {import("mongoose").Types.ObjectId|string} options.ownerId Verified owner ObjectId
 * @param {number} [options.page=1] Current page number
 * @param {number} [options.limit=10] Items per page (max 50)
 * @param {string} [options.search=""] Keyword matching title, shortDescription, tags, techStack
 * @param {string} [options.status=""] Filter by status enum
 * @param {string} [options.priority=""] Filter by priority enum
 * @param {string} [options.category=""] Filter by category
 * @param {string} [options.visibility=""] Filter by visibility enum
 * @param {string} [options.sortBy="updatedAt"] Sort field
 * @param {string} [options.sortOrder="desc"] Sort direction ("asc" or "desc")
 * @returns {Promise<{ projects: Array, pagination: object }>}
 */
export async function getProjectsList({
  ownerId,
  page = 1,
  limit = 10,
  search = "",
  status = "",
  priority = "",
  category = "",
  visibility = "",
  sortBy = "updatedAt",
  sortOrder = "desc",
}) {
  await connectToDatabase();

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

  const safeSortBy = SORTABLE_FIELDS.includes(sortBy) ? sortBy : "updatedAt";
  const safeSortDirection = sortOrder?.toLowerCase() === "asc" ? 1 : -1;

  // Build owner-scoped query filter
  const query = { owner: ownerId };

  if (status && PROJECT_STATUSES.includes(status)) {
    query.status = status;
  }

  if (visibility && PROJECT_VISIBILITIES.includes(visibility)) {
    query.visibility = visibility;
  }

  if (priority && PROJECT_PRIORITIES.includes(priority)) {
    query.priority = priority;
  }

  if (category && typeof category === "string") {
    query.category = category.trim();
  }

  if (search && typeof search === "string" && search.trim()) {
    const sanitizedRegex = new RegExp(escapeRegex(search.trim()), "i");
    query.$or = [
      { title: sanitizedRegex },
      { shortDescription: sanitizedRegex },
      { tags: sanitizedRegex },
      { techStack: sanitizedRegex },
    ];
  }

  const total = await Project.countDocuments(query);
  const skip = (safePage - 1) * safeLimit;

  const rawProjects = await Project.find(query)
    .sort({ [safeSortBy]: safeSortDirection })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  // If projects exist, aggregate task counts to compute dynamic progress
  let projects = [];
  if (rawProjects.length > 0) {
    const projectIds = rawProjects.map((p) => p._id);
    const taskCountAgg = await Task.aggregate([
      { $match: { owner: ownerId, project: { $in: projectIds } } },
      {
        $group: {
          _id: "$project",
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Done"] }, 1, 0] },
          },
        },
      },
    ]);

    const taskCountMap = new Map();
    for (const item of taskCountAgg) {
      taskCountMap.set(item._id.toString(), {
        total: item.total,
        completed: item.completed,
      });
    }

    projects = rawProjects.map((proj) => {
      const stats = taskCountMap.get(proj._id.toString()) || { total: 0, completed: 0 };
      let progress = proj.progress || 0;
      let progressSource = "manual";

      if (stats.total > 0) {
        progress = Math.round((stats.completed / stats.total) * 100);
        progressSource = "tasks";
      }

      return {
        ...proj,
        _id: proj._id.toString(),
        owner: proj.owner.toString(),
        progress,
        progressSource,
        manualProgress: proj.progress || 0,
        taskCounts: {
          total: stats.total,
          completed: stats.completed,
        },
      };
    });
  }

  const totalPages = Math.ceil(total / safeLimit) || 1;

  return {
    projects,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
}

/**
 * Retrieves full details for a single project owned by the verified owner,
 * including its tasks, milestones, and dynamically calculated progress and statistics.
 *
 * @param {object} options
 * @param {string|import("mongoose").Types.ObjectId} options.projectId
 * @param {string|import("mongoose").Types.ObjectId} options.ownerId
 * @returns {Promise<{ project: object, tasks: Array, milestones: Array, stats: object } | null>}
 */
export async function getProjectDetails({ projectId, ownerId }) {
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return null;
  }

  await connectToDatabase();

  const rawProject = await Project.findOne({
    _id: projectId,
    owner: ownerId,
  }).lean();

  if (!rawProject) {
    return null;
  }

  const rawTasks = await Task.find({
    project: projectId,
    owner: ownerId,
  })
    .sort({ createdAt: -1 })
    .lean();

  const rawMilestones = await Milestone.find({
    project: projectId,
    owner: ownerId,
  })
    .sort({ targetDate: 1, createdAt: 1 })
    .lean();

  const taskStats = calculateProjectProgress(rawTasks, rawProject.progress || 0);
  const milestoneCounts = calculateMilestoneStats(rawMilestones);

  const project = {
    ...rawProject,
    _id: rawProject._id.toString(),
    owner: rawProject.owner.toString(),
    startDate: rawProject.startDate ? rawProject.startDate.toISOString() : null,
    deadline: rawProject.deadline ? rawProject.deadline.toISOString() : null,
    completedAt: rawProject.completedAt ? rawProject.completedAt.toISOString() : null,
    createdAt: rawProject.createdAt ? rawProject.createdAt.toISOString() : null,
    updatedAt: rawProject.updatedAt ? rawProject.updatedAt.toISOString() : null,
    progress: taskStats.progress,
    progressSource: taskStats.progressSource,
    manualProgress: rawProject.progress || 0,
    taskCounts: taskStats.taskCounts,
    milestoneCounts,
  };

  const tasks = rawTasks.map((t) => ({
    ...t,
    _id: t._id.toString(),
    owner: t.owner.toString(),
    project: t.project.toString(),
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt ? t.createdAt.toISOString() : null,
    updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
  }));

  const milestones = rawMilestones.map((m) => ({
    ...m,
    _id: m._id.toString(),
    owner: m.owner.toString(),
    project: m.project.toString(),
    targetDate: m.targetDate ? m.targetDate.toISOString() : null,
    completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    createdAt: m.createdAt ? m.createdAt.toISOString() : null,
    updatedAt: m.updatedAt ? m.updatedAt.toISOString() : null,
  }));

  return {
    project,
    tasks,
    milestones,
    stats: {
      taskCounts: taskStats.taskCounts,
      milestoneCounts,
      progress: taskStats.progress,
      progressSource: taskStats.progressSource,
    },
  };
}
