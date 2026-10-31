import { NextResponse } from "next/server.js";
import mongoose from "mongoose";
import { checkOwnerAccess } from "../../../../../lib/auth/session.js";
import { connectToDatabase } from "../../../../../lib/db/mongodb.js";
import { getVerifiedOwnerId } from "../../../../../lib/api/owner-resolver.js";
import Project from "../../../../../models/Project.js";
import Task, {
  TASK_STATUSES,
  TASK_PRIORITIES,
} from "../../../../../models/Task.js";
import {
  validateTaskPayload,
  TASK_SORTABLE_FIELDS,
} from "../../../../../lib/api/task-validation.js";
import {
  resolveTransactionSupport,
  getTestHook,
} from "../../../../../lib/api/project-cascade.js";

/**
 * GET /api/projects/[id]/tasks
 * Lists tasks belonging to the specified project and authenticated owner.
 */
export async function GET(req, { params }) {
  try {
    // 1. Enforce server-side owner authorization
    const auth = await checkOwnerAccess(req?._testSession);
    if (auth.status === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (auth.status === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Access denied. Owner authorization required." },
        { status: 403 }
      );
    }

    // 2. Validate route parameter
    const resolvedParams = await params;
    const projectId = resolvedParams?.id;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return NextResponse.json(
        { error: "Invalid project ID format" },
        { status: 400 }
      );
    }

    // 3. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 4. Verify parent project exists and belongs to the verified owner
    const project = await Project.findOne({
      _id: projectId,
      owner: ownerId,
    }).lean();

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // 5. Parse and validate query parameters
    const { searchParams } = new URL(req.url);

    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 20 : Math.min(limitParam, 50);

    const status = searchParams.get("status")?.trim() || "";
    const priority = searchParams.get("priority")?.trim() || "";

    const sortByParam = searchParams.get("sortBy")?.trim() || "createdAt";
    if (!TASK_SORTABLE_FIELDS.includes(sortByParam)) {
      return NextResponse.json(
        { error: `Invalid sortBy field. Allowed: ${TASK_SORTABLE_FIELDS.join(", ")}` },
        { status: 400 }
      );
    }
    const sortBy = sortByParam;

    const sortOrderParam = searchParams.get("sortOrder")?.toLowerCase().trim() || "desc";
    if (sortOrderParam !== "asc" && sortOrderParam !== "desc") {
      return NextResponse.json(
        { error: "Invalid sortOrder. Allowed: 'asc', 'desc'" },
        { status: 400 }
      );
    }
    const sortDirection = sortOrderParam === "asc" ? 1 : -1;

    // 6. Build query scoped to project and verified owner
    const query = {
      project: projectId,
      owner: ownerId,
    };

    if (status) {
      if (!TASK_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status filter. Allowed: ${TASK_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      query.status = status;
    }

    if (priority) {
      if (!TASK_PRIORITIES.includes(priority)) {
        return NextResponse.json(
          { error: `Invalid priority filter. Allowed: ${TASK_PRIORITIES.join(", ")}` },
          { status: 400 }
        );
      }
      query.priority = priority;
    }

    // 7. Execute pagination query
    const total = await Task.countDocuments(query);
    const skip = (page - 1) * limit;

    const tasks = await Task.find(query)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json(
      {
        tasks,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("API GET /api/projects/[id]/tasks error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving tasks" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/tasks
 * Creates a new task bound strictly to the specified project and authenticated owner.
 */
export async function POST(req, { params }) {
  try {
    // 1. Enforce server-side owner authorization
    const auth = await checkOwnerAccess(req?._testSession);
    if (auth.status === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (auth.status === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Access denied. Owner authorization required." },
        { status: 403 }
      );
    }

    // 2. Validate route parameter
    const resolvedParams = await params;
    const projectId = resolvedParams?.id;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return NextResponse.json(
        { error: "Invalid project ID format" },
        { status: 400 }
      );
    }

    // 3. Enforce application/json Content-Type
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json" },
        { status: 415 }
      );
    }

    // 4. Parse request body safely
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON in request body" },
        { status: 400 }
      );
    }

    // 5. Validate task payload (whitelists fields, rejects forbidden fields)
    const { isValid, errors, sanitized } = validateTaskPayload(body, false);
    if (!isValid) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 });
    }

    // 6. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 7. Check transaction support (strictly queries deployment in production; honors test hook only outside production)
    const hasTxSupport = await resolveTransactionSupport(req);

    // 8. Task completion semantics: set completedAt if marked Done and not provided
    if (sanitized.status === "Done" && !sanitized.completedAt) {
      sanitized.completedAt = new Date();
    }

    if (hasTxSupport) {
      const session = await mongoose.startSession();
      try {
        let createdTask;
        await session.withTransaction(async () => {
          // Atomically verify parent project exists, belongs to owner, is not deleting, and coordinate lock
          const project = await Project.findOneAndUpdate(
            {
              _id: projectId,
              owner: ownerId,
              isDeleting: { $ne: true },
            },
            {
              $set: { updatedAt: new Date() },
            },
            { session, new: true }
          );

          if (!project) {
            const notFoundError = new Error("Project not found");
            notFoundError.statusCode = 404;
            throw notFoundError;
          }

          if (getTestHook(req, "_testInjectFailureStep") === "afterParentLock") {
            throw new Error("Simulated failure after parent lock in task creation");
          }

          const task = new Task({
            ...sanitized,
            project: projectId,
            owner: ownerId,
          });

          await task.save({ session });
          createdTask = task;
        });

        return NextResponse.json({ task: createdTask }, { status: 201 });
      } finally {
        await session.endSession();
      }
    } else {
      // Standalone MongoDB fallback: verify parent project exists, belongs to owner, and is not deleting
      const project = await Project.findOne({
        _id: projectId,
        owner: ownerId,
        isDeleting: { $ne: true },
      });

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      const task = new Task({
        ...sanitized,
        project: projectId,
        owner: ownerId,
      });

      await task.save();

      return NextResponse.json({ task }, { status: 201 });
    }
  } catch (err) {
    if (err.statusCode === 404 || err.message === "Project not found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return NextResponse.json({ error: "Validation failed", errors: messages }, { status: 400 });
    }

    console.error("API POST /api/projects/[id]/tasks error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while creating task" },
      { status: 500 }
    );
  }
}
