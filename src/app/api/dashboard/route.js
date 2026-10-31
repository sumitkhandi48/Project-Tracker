import { NextResponse } from "next/server.js";
import { checkOwnerAccess } from "../../../lib/auth/session.js";
import { connectToDatabase } from "../../../lib/db/mongodb.js";
import { getVerifiedOwnerId } from "../../../lib/api/owner-resolver.js";
import { getDashboardSummary } from "../../../lib/api/dashboard-service.js";

/**
 * GET /api/dashboard
 * Retrieves owner-scoped workspace dashboard metrics, recent projects with dynamic progress,
 * upcoming/overdue work items, and recent telemetry activity.
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

    // 2. Connect to database and resolve verified owner
    await connectToDatabase();
    const ownerId = await getVerifiedOwnerId(auth.session);

    // 3. Compute owner-scoped dashboard metrics
    const data = await getDashboardSummary(ownerId);

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("API GET /api/dashboard error:", err.message);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving dashboard data" },
      { status: 500 }
    );
  }
}
