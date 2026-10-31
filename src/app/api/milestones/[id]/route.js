import { NextResponse } from "next/server.js";
import mongoose from "mongoose";
import { checkOwnerAccess } from "../../../../lib/auth/session.js";
import { connectToDatabase } from "../../../../lib/db/mongodb.js";
import { getVerifiedOwnerId } from "../../../../lib/api/owner-resolver.js";
import Milestone from "../../../../models/Milestone.js";
import { validateMilestonePayload } from "../../../../lib/api/milestone-validation.js";

/**
 * GET /api/milestones/[id]
 * Retrieves a single milestone owned by the authenticated owner.
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
    const id = resolvedParams?.id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid milestone ID format" },
        { status: 400 }
      );
    }

    // 3. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 4. Query owner-scoped milestone
    const milestone = await Milestone.findOne({ _id: id, owner: ownerId }).lean();
    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ milestone }, { status: 200 });
  } catch (err) {
    console.error("API GET /api/milestones/[id] error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving milestone" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/milestones/[id]
 * Updates an authorized milestone. Prevents mass assignment and protects owner and project references.
 */
export async function PATCH(req, { params }) {
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
    const id = resolvedParams?.id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid milestone ID format" },
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

    // 5. Validate and sanitize payload (update mode)
    const { isValid, errors, sanitized } = validateMilestonePayload(body, true);
    if (!isValid) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 });
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update" },
        { status: 400 }
      );
    }

    // 6. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 7. Find existing milestone strictly scoped to verified owner
    const currentMilestone = await Milestone.findOne({ _id: id, owner: ownerId });
    if (!currentMilestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    // 8. Completion timestamp transitions:
    // When marking Completed, auto-set completedAt if not explicitly provided.
    // When moving away from Completed, clear completedAt if not explicitly provided.
    // Unrelated updates do not alter existing completedAt.
    const isChangingToCompleted =
      sanitized.status === "Completed" && currentMilestone.status !== "Completed";
    const isChangingFromCompleted =
      sanitized.status &&
      sanitized.status !== "Completed" &&
      currentMilestone.status === "Completed";

    if (isChangingToCompleted && !("completedAt" in sanitized)) {
      sanitized.completedAt = new Date();
    } else if (isChangingFromCompleted && !("completedAt" in sanitized)) {
      sanitized.completedAt = null;
    }

    // 9. Update milestone document strictly scoped to verified owner
    const updatedMilestone = await Milestone.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set: sanitized },
      { new: true, runValidators: true }
    );

    return NextResponse.json({ milestone: updatedMilestone }, { status: 200 });
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return NextResponse.json({ error: "Validation failed", errors: messages }, { status: 400 });
    }

    console.error("API PATCH /api/milestones/[id] error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while updating milestone" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/milestones/[id]
 * Deletes an authorized milestone.
 */
export async function DELETE(req, { params }) {
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
    const id = resolvedParams?.id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid milestone ID format" },
        { status: 400 }
      );
    }

    // 3. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 4. Delete document scoped strictly to verified owner
    const deletedMilestone = await Milestone.findOneAndDelete({
      _id: id,
      owner: ownerId,
    });

    if (!deletedMilestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        message: "Milestone deleted successfully",
        deletedId: id,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("API DELETE /api/milestones/[id] error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while deleting milestone" },
      { status: 500 }
    );
  }
}
