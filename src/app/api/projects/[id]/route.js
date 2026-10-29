import { NextResponse } from "next/server.js";
import mongoose from "mongoose";
import { checkOwnerAccess } from "../../../../lib/auth/session.js";
import { connectToDatabase } from "../../../../lib/db/mongodb.js";
import Project from "../../../../models/Project.js";
import { validateProjectPayload } from "../../../../lib/api/project-validation.js";
import { getVerifiedOwnerId } from "../../../../lib/api/owner-resolver.js";

/**
 * GET /api/projects/[id]
 * Retrieves a single project owned by the authenticated owner.
 */
export async function GET(req, { params }) {
  try {
    // 1. Enforce server-side owner authorization
    const auth = await checkOwnerAccess();
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
        { error: "Invalid project ID format" },
        { status: 400 }
      );
    }

    // 3. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 4. Query owner-scoped project
    const project = await Project.findOne({ _id: id, owner: ownerId }).lean();
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ project }, { status: 200 });
  } catch (err) {
    console.error(`API GET /api/projects/[id] error:`, err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving project" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 * Updates an authorized project. Prevents mass assignment on protected fields.
 */
export async function PATCH(req, { params }) {
  try {
    // 1. Enforce server-side owner authorization
    const auth = await checkOwnerAccess();
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
        { error: "Invalid project ID format" },
        { status: 400 }
      );
    }

    // 3. Parse request body safely
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON in request body" },
        { status: 400 }
      );
    }

    // 4. Validate and sanitize payload (update mode)
    const { isValid, errors, sanitized } = validateProjectPayload(body, true);
    if (!isValid) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 });
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update" },
        { status: 400 }
      );
    }

    // 5. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 6. If updating slug, verify compound uniqueness against other projects of this owner
    if (sanitized.slug) {
      const duplicateSlug = await Project.findOne({
        owner: ownerId,
        slug: sanitized.slug,
        _id: { $ne: id },
      });

      if (duplicateSlug) {
        return NextResponse.json(
          { error: `A project with the slug '${sanitized.slug}' already exists` },
          { status: 409 }
        );
      }
    }

    // 7. Update document scoped strictly to verified owner
    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set: sanitized },
      { new: true, runValidators: true }
    );

    if (!updatedProject) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ project: updatedProject }, { status: 200 });
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return NextResponse.json({ error: "Validation failed", errors: messages }, { status: 400 });
    }

    if (err.code === 11000) {
      return NextResponse.json(
        { error: "A project with this slug already exists" },
        { status: 409 }
      );
    }

    console.error(`API PATCH /api/projects/[id] error:`, err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while updating project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Deletes an authorized project.
 * Documented cascade note: Tasks, milestones, and activities are preserved
 * for historical audit in Phase 4A and will be cascade-deleted or archived in Phase 4B.
 */
export async function DELETE(req, { params }) {
  try {
    // 1. Enforce server-side owner authorization
    const auth = await checkOwnerAccess();
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
        { error: "Invalid project ID format" },
        { status: 400 }
      );
    }

    // 3. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 4. Delete document scoped strictly to verified owner
    const deletedProject = await Project.findOneAndDelete({
      _id: id,
      owner: ownerId,
    });

    if (!deletedProject) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        message: "Project deleted successfully",
        deletedId: id,
        cascadeNotice:
          "Associated tasks, milestones, and activities are preserved for audit in Phase 4A and will be cascade-deleted or archived in Phase 4B.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`API DELETE /api/projects/[id] error:`, err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while deleting project" },
      { status: 500 }
    );
  }
}
