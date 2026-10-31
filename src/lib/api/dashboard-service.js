import { connectToDatabase } from "../db/mongodb.js";
import Project, { PROJECT_STATUSES } from "../../models/Project.js";
import Task, { TASK_STATUSES } from "../../models/Task.js";
import Milestone, { MILESTONE_STATUSES } from "../../models/Milestone.js";
import Activity from "../../models/Activity.js";

/**
 * Computes live, owner-scoped dashboard summary metrics and statistics.
 *
 * Requirements:
 * - Scoped strictly to the verified owner ID.
 * - Computes project, task, and milestone counts and status distributions.
 * - Dynamically calculates project progress from completed tasks when tasks exist;
 *   otherwise falls back to the manual progress stored on the Project document.
 * - Aggregates task stats for recent projects without loading all tasks into memory.
 * - Returns upcoming and overdue tasks and milestones.
 * - Returns recent activities or an empty array if none exist.
 *
 * @param {import("mongoose").Types.ObjectId|string} ownerId Verified owner ObjectId
 * @returns {Promise<object>} Dashboard summary data
 */
export async function getDashboardSummary(ownerId) {
  await connectToDatabase();
  const now = new Date();

  // 1. Projects aggregation: total & by status
  const [totalProjects, projectStatusAgg] = await Promise.all([
    Project.countDocuments({ owner: ownerId }),
    Project.aggregate([
      { $match: { owner: ownerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const projectsByStatus = {};
  for (const status of PROJECT_STATUSES) {
    projectsByStatus[status] = 0;
  }
  for (const item of projectStatusAgg) {
    if (item._id && projectsByStatus[item._id] !== undefined) {
      projectsByStatus[item._id] = item.count;
    }
  }

  // 2. Tasks aggregation: total, by status, completed, outstanding, overdue
  const [totalTasks, taskStatusAgg, overdueTasksCount] = await Promise.all([
    Task.countDocuments({ owner: ownerId }),
    Task.aggregate([
      { $match: { owner: ownerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Task.countDocuments({
      owner: ownerId,
      status: { $ne: "Done" },
      dueDate: { $ne: null, $lt: now },
    }),
  ]);

  const tasksByStatus = {};
  for (const status of TASK_STATUSES) {
    tasksByStatus[status] = 0;
  }
  for (const item of taskStatusAgg) {
    if (item._id && tasksByStatus[item._id] !== undefined) {
      tasksByStatus[item._id] = item.count;
    }
  }

  const completedTasks = tasksByStatus["Done"] || 0;
  const outstandingTasks = (tasksByStatus["Todo"] || 0) + (tasksByStatus["In Progress"] || 0);

  // 3. Milestones aggregation: total, by status, completed, outstanding, overdue
  const [totalMilestones, milestoneStatusAgg, overdueMilestonesCount] = await Promise.all([
    Milestone.countDocuments({ owner: ownerId }),
    Milestone.aggregate([
      { $match: { owner: ownerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Milestone.countDocuments({
      owner: ownerId,
      status: { $ne: "Completed" },
      targetDate: { $ne: null, $lt: now },
    }),
  ]);

  const milestonesByStatus = {};
  for (const status of MILESTONE_STATUSES) {
    milestonesByStatus[status] = 0;
  }
  for (const item of milestoneStatusAgg) {
    if (item._id && milestonesByStatus[item._id] !== undefined) {
      milestonesByStatus[item._id] = item.count;
    }
  }

  const completedMilestones = milestonesByStatus["Completed"] || 0;
  const outstandingMilestones =
    (milestonesByStatus["Planned"] || 0) + (milestonesByStatus["In Progress"] || 0);

  // 4. Recent Projects (up to 5, sorted by actual updatedAt)
  const recentProjectsRaw = await Project.find({ owner: ownerId })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();

  // Aggregate task counts for recent projects to calculate progress dynamically
  let recentProjects = [];
  if (recentProjectsRaw.length > 0) {
    const projectIds = recentProjectsRaw.map((p) => p._id);
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

    recentProjects = recentProjectsRaw.map((proj) => {
      const stats = taskCountMap.get(proj._id.toString()) || { total: 0, completed: 0 };
      let progress = proj.progress || 0;
      let progressSource = "manual";

      if (stats.total > 0) {
        progress = Math.round((stats.completed / stats.total) * 100);
        progressSource = "tasks";
      }

      return {
        _id: proj._id.toString(),
        title: proj.title,
        slug: proj.slug,
        shortDescription: proj.shortDescription,
        category: proj.category || "General",
        status: proj.status,
        priority: proj.priority,
        visibility: proj.visibility,
        progress,
        progressSource,
        manualProgress: proj.progress || 0,
        taskCounts: {
          total: stats.total,
          completed: stats.completed,
        },
        deadline: proj.deadline || null,
        updatedAt: proj.updatedAt,
        createdAt: proj.createdAt,
      };
    });
  }

  // 5. Upcoming & Overdue Tasks (limited to 5 each)
  const [upcomingTasksRaw, overdueTasksRaw] = await Promise.all([
    Task.find({
      owner: ownerId,
      status: { $ne: "Done" },
      dueDate: { $ne: null, $gte: now },
    })
      .sort({ dueDate: 1 })
      .limit(5)
      .populate("project", "title slug")
      .lean(),
    Task.find({
      owner: ownerId,
      status: { $ne: "Done" },
      dueDate: { $ne: null, $lt: now },
    })
      .sort({ dueDate: 1 })
      .limit(5)
      .populate("project", "title slug")
      .lean(),
  ]);

  const mapTask = (t) => ({
    _id: t._id.toString(),
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    project: t.project
      ? {
          _id: t.project._id?.toString(),
          title: t.project.title,
          slug: t.project.slug,
        }
      : null,
  });

  const upcomingTasks = upcomingTasksRaw.map(mapTask);
  const overdueTasks = overdueTasksRaw.map(mapTask);

  // 6. Upcoming & Overdue Milestones (limited to 5 each)
  const [upcomingMilestonesRaw, overdueMilestonesRaw] = await Promise.all([
    Milestone.find({
      owner: ownerId,
      status: { $ne: "Completed" },
      targetDate: { $ne: null, $gte: now },
    })
      .sort({ targetDate: 1 })
      .limit(5)
      .populate("project", "title slug")
      .lean(),
    Milestone.find({
      owner: ownerId,
      status: { $ne: "Completed" },
      targetDate: { $ne: null, $lt: now },
    })
      .sort({ targetDate: 1 })
      .limit(5)
      .populate("project", "title slug")
      .lean(),
  ]);

  const mapMilestone = (m) => ({
    _id: m._id.toString(),
    title: m.title,
    status: m.status,
    targetDate: m.targetDate,
    project: m.project
      ? {
          _id: m.project._id?.toString(),
          title: m.project.title,
          slug: m.project.slug,
        }
      : null,
  });

  const upcomingMilestones = upcomingMilestonesRaw.map(mapMilestone);
  const overdueMilestones = overdueMilestonesRaw.map(mapMilestone);

  // 7. Recent Activities (limited to 10)
  const recentActivitiesRaw = await Activity.find({ owner: ownerId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(10)
    .populate("project", "title slug")
    .lean();

  const recentActivities = recentActivitiesRaw.map((a) => ({
    _id: a._id.toString(),
    type: a.type,
    message: a.message,
    metadata: a.metadata || {},
    createdAt: a.createdAt,
    project: a.project
      ? {
          _id: a.project._id?.toString(),
          title: a.project.title,
          slug: a.project.slug,
        }
      : null,
  }));

  // Overall workspace task completion rate (percentage)
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Overall milestone completion rate (percentage)
  const milestoneCompletionRate =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  return {
    stats: {
      projects: {
        total: totalProjects,
        byStatus: projectsByStatus,
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        outstanding: outstandingTasks,
        overdue: overdueTasksCount,
        completionRate: taskCompletionRate,
        byStatus: tasksByStatus,
      },
      milestones: {
        total: totalMilestones,
        completed: completedMilestones,
        outstanding: outstandingMilestones,
        overdue: overdueMilestonesCount,
        completionRate: milestoneCompletionRate,
        byStatus: milestonesByStatus,
      },
    },
    recentProjects,
    upcomingTasks,
    overdueTasks,
    upcomingMilestones,
    overdueMilestones,
    recentActivities,
  };
}
