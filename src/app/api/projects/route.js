import { NextResponse } from "next/server.js";
import { checkOwnerAccess } from "../../../lib/auth/session.js";
import { connectToDatabase } from "../../../lib/db/mongodb.js";
import Project, {
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  PROJECT_PRIORITIES,
} from "../../../models/Project.js";
import {
  validateProjectPayload,
  SORTABLE_FIELDS,
} from "../../../lib/api/project-validation.js";
import { getVerifiedOwnerId } from "../../../lib/api/owner-resolver.js";

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * GET /api/projects
 * Lists projects owned by the authenticated owner with filtering, search, pagination, and sorting.
 */
export async function GET(req) {
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

    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 2. Parse and validate query parameters
    const { searchParams } = new URL(req.url);

    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 10 : Math.min(limitParam, 50);

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const visibility = searchParams.get("visibility")?.trim() || "";
    const priority = searchParams.get("priority")?.trim() || "";
    const category = searchParams.get("category")?.trim() || "";

    const sortByParam = searchParams.get("sortBy")?.trim() || "updatedAt";
    if (!SORTABLE_FIELDS.includes(sortByParam)) {
      return NextResponse.json(
        { error: `Invalid sortBy field. Allowed: ${SORTABLE_FIELDS.join(", ")}` },
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

    // 3. Build owner-scoped query
    const query = { owner: ownerId };

    if (status) {
      if (!PROJECT_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status filter. Allowed: ${PROJECT_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      query.status = status;
    }

    if (visibility) {
      if (!PROJECT_VISIBILITIES.includes(visibility)) {
        return NextResponse.json(
          { error: `Invalid visibility filter. Allowed: ${PROJECT_VISIBILITIES.join(", ")}` },
          { status: 400 }
        );
      }
      query.visibility = visibility;
    }

    if (priority) {
      if (!PROJECT_PRIORITIES.includes(priority)) {
        return NextResponse.json(
          { error: `Invalid priority filter. Allowed: ${PROJECT_PRIORITIES.join(", ")}` },
          { status: 400 }
        );
      }
      query.priority = priority;
    }

    if (category) {
      query.category = category;
    }

    if (search) {
      const sanitizedRegex = new RegExp(escapeRegex(search), "i");
      query.$or = [
        { title: sanitizedRegex },
        { shortDescription: sanitizedRegex },
        { tags: sanitizedRegex },
        { techStack: sanitizedRegex },
      ];
    }

    // 4. Execute pagination query
    const total = await Project.countDocuments(query);
    const skip = (page - 1) * limit;

    const projects = await Project.find(query)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json(
      {
        projects,
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
    console.error("API GET /api/projects error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * Creates a new project strictly bound to the authenticated owner.
 */
export async function POST(req) {
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

    // 2. Parse request body safely
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON in request body" },
        { status: 400 }
      );
    }

    // 3. Validate payload (whitelist fields, prevent mass assignment)
    const { isValid, errors, sanitized } = validateProjectPayload(body, false);
    if (!isValid) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 });
    }

    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 4. Verify compound uniqueness on { owner, slug }
    const existing = await Project.findOne({ owner: ownerId, slug: sanitized.slug });
    if (existing) {
      return NextResponse.json(
        { error: `A project with the slug '${sanitized.slug}' already exists` },
        { status: 409 }
      );
    }

    // 5. Create project document bound strictly to verified owner ID
    const project = new Project({
      ...sanitized,
      owner: ownerId,
    });

    await project.save();

    return NextResponse.json({ project }, { status: 201 });
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

    console.error("API POST /api/projects error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while creating project" },
      { status: 500 }
    );
  }
}
