import { NextResponse } from "next/server.js";
import mongoose from "mongoose";
import { checkOwnerAccess } from "../../../../../lib/auth/session.js";
import { connectToDatabase } from "../../../../../lib/db/mongodb.js";
import { getVerifiedOwnerId } from "../../../../../lib/api/owner-resolver.js";
import Project from "../../../../../models/Project.js";
import Milestone, { MILESTONE_STATUSES } from "../../../../../models/Milestone.js";
import {
  validateMilestonePayload,
  MILESTONE_SORTABLE_FIELDS,
} from "../../../../../lib/api/milestone-validation.js";
import {
  resolveTransactionSupport,
  getTestHook,
} from "../../../../../lib/api/project-cascade.js";

/**
 * GET /api/projects/[id]/milestones
 * Lists milestones belonging to the specified project and authenticated owner.
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

    const sortByParam = searchParams.get("sortBy")?.trim() || "targetDate";
    if (!MILESTONE_SORTABLE_FIELDS.includes(sortByParam)) {
      return NextResponse.json(
        { error: `Invalid sortBy field. Allowed: ${MILESTONE_SORTABLE_FIELDS.join(", ")}` },
        { status: 400 }
      );
    }
    const sortBy = sortByParam;

    const sortOrderParam = searchParams.get("sortOrder")?.toLowerCase().trim() || "asc";
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
      if (!MILESTONE_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status filter. Allowed: ${MILESTONE_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      query.status = status;
    }

    // 7. Execute pagination query
    const total = await Milestone.countDocuments(query);
    const skip = (page - 1) * limit;

    const milestones = await Milestone.find(query)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json(
      {
        milestones,
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
    console.error("API GET /api/projects/[id]/milestones error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving milestones" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/milestones
 * Creates a new milestone bound strictly to the specified project and authenticated owner.
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

    // 5. Validate milestone payload (whitelists fields, rejects forbidden fields)
    const { isValid, errors, sanitized } = validateMilestonePayload(body, false);
    if (!isValid) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 });
    }

    // 6. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 7. Check transaction support (strictly queries deployment in production; honors test hook only outside production)
    const hasTxSupport = await resolveTransactionSupport(req);

    // 8. Completion timestamp semantics: set completedAt if marked Completed and not provided
    if (sanitized.status === "Completed" && !sanitized.completedAt) {
      sanitized.completedAt = new Date();
    }

    if (hasTxSupport) {
      const session = await mongoose.startSession();
      try {
        let createdMilestone;
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
            throw new Error("Simulated failure after parent lock in milestone creation");
          }

          const milestone = new Milestone({
            ...sanitized,
            project: projectId,
            owner: ownerId,
          });

          await milestone.save({ session });
          createdMilestone = milestone;
        });

        return NextResponse.json({ milestone: createdMilestone }, { status: 201 });
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

      const milestone = new Milestone({
        ...sanitized,
        project: projectId,
        owner: ownerId,
      });

      await milestone.save();

      return NextResponse.json({ milestone }, { status: 201 });
    }
  } catch (err) {
    if (err.statusCode === 404 || err.message === "Project not found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return NextResponse.json({ error: "Validation failed", errors: messages }, { status: 400 });
    }

    console.error("API POST /api/projects/[id]/milestones error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while creating milestone" },
      { status: 500 }
    );
  }
}
