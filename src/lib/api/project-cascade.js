import mongoose from "mongoose";
import Project from "../../models/Project.js";
import Task from "../../models/Task.js";
import Milestone from "../../models/Milestone.js";
import Activity from "../../models/Activity.js";

/**
 * Checks whether the connected MongoDB deployment supports multi-document transactions.
 * Transactions require a replica set member or mongos router.
 *
 * @param {object} [dbOverride] Optional MongoDB db instance
 * @returns {Promise<boolean>}
 */
export async function checkTransactionSupport(dbOverride = null) {
  try {
    const db = dbOverride || mongoose.connection.db;
    if (!db) return false;
    const admin = db.admin();
    const isMaster = await admin.command({ isMaster: 1 });
    return Boolean(isMaster.setName || isMaster.msg === "isdbgrid");
  } catch {
    return false;
  }
}

/**
 * Safely extracts a testing hook property from an incoming request or options object.
 * In production (process.env.NODE_ENV === "production"), all test hooks are strictly ignored
 * and return the fallback value.
 *
 * @param {object} [target] Object containing potential test hooks (e.g. req or options)
 * @param {string} hookName Name of the hook property (e.g. '_testForceTxSupport', '_testInjectFailureStep')
 * @param {any} [fallback=null] Fallback value returned in production or when undefined
 * @returns {any}
 */
export function getTestHook(target, hookName, fallback = null) {
  if (process.env.NODE_ENV === "production") {
    return fallback;
  }
  return target?.[hookName] !== undefined ? target[hookName] : fallback;
}

/**
 * Resolves transaction support for the deployment.
 * In production (process.env.NODE_ENV === "production"), strictly queries the active MongoDB deployment.
 * Outside production, honors req?._testForceTxSupport if explicitly supplied.
 *
 * @param {object} [req] Incoming request object
 * @returns {Promise<boolean>}
 */
export async function resolveTransactionSupport(req = null) {
  const forced = getTestHook(req, "_testForceTxSupport", null);
  if (forced !== null) {
    return Boolean(forced);
  }
  return await checkTransactionSupport();
}

/**
 * Executes owner-scoped transactional cascade deletion of a project and all associated
 * records (tasks, milestones, activities).
 *
 * Strategy & Guarantees:
 * 1. Transaction-Capable Deployments (MongoDB Atlas / Replica Set):
 *    - Atomically updates the project document setting `isDeleting: true` with `{ isDeleting: { $ne: true } }`.
 *      This acquires a WiredTiger document-level write lock that serializes against concurrent child creation.
 *    - Deletes child Tasks scoped to { project: projectId, owner: ownerId }.
 *    - Deletes child Milestones scoped to { project: projectId, owner: ownerId }.
 *    - Deletes child Activities scoped to { project: projectId, owner: ownerId }.
 *    - Deletes the Project document.
 *    - Commits the transaction. If any failure occurs, all operations roll back atomically.
 * 2. Standalone Deployments (Transactions Unsupported):
 *    - Fails closed immediately with HTTP 501.
 *    - Verifies project existence and verified ownership first (returning 404 if not found).
 *    - Performs ZERO database modifications, preventing orphaned records and non-atomic partial states.
 *
 * @param {object} options
 * @param {string|import("mongoose").Types.ObjectId} options.projectId
 * @param {string|import("mongoose").Types.ObjectId} options.ownerId
 * @param {boolean} [options.forceTransactionSupport] Optional flag to force or mock transaction branch in tests (ignored in production)
 * @param {Function|string} [options._injectFailureStep] Optional hook to simulate failure at a step for test coverage (ignored in production)
 * @returns {Promise<{ success: boolean, deletedId: string, transactional: boolean, cascadeStats: object }>}
 */
export async function executeProjectCascadeDeletion({
  projectId,
  ownerId,
  forceTransactionSupport = null,
  _injectFailureStep = null,
}) {
  // In production, strictly ignore injected transaction support and simulated failure steps
  const effectiveForceTxSupport = getTestHook(
    { forceTransactionSupport },
    "forceTransactionSupport",
    null
  );
  const effectiveInjectFailureStep = getTestHook(
    { _injectFailureStep },
    "_injectFailureStep",
    null
  );

  const hasTxSupport =
    effectiveForceTxSupport !== null
      ? effectiveForceTxSupport
      : await checkTransactionSupport();

  // -------------------------------------------------------------------------
  // Branch A: Multi-Document ACID Transaction (Replica Set / MongoDB Atlas)
  // -------------------------------------------------------------------------
  if (hasTxSupport) {
    const session = await mongoose.startSession();
    try {
      let taskCount = 0;
      let milestoneCount = 0;
      let activityCount = 0;

      await session.withTransaction(async () => {
        // 1. Atomically verify project exists, belongs to owner, not already deleting, and mark as deleting
        const project = await Project.findOneAndUpdate(
          {
            _id: projectId,
            owner: ownerId,
            isDeleting: { $ne: true },
          },
          {
            $set: { isDeleting: true },
          },
          { session, new: true }
        );

        if (!project) {
          const notFoundError = new Error("Project not found");
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        if (effectiveInjectFailureStep === "afterMarkDeleting") {
          throw new Error("Simulated failure after marking isDeleting");
        }

        if (effectiveInjectFailureStep === "beforeTasks") {
          throw new Error("Simulated failure before task deletion");
        }

        // 2. Delete child tasks scoped to both project and owner
        const taskRes = await Task.deleteMany(
          { project: projectId, owner: ownerId },
          { session }
        );
        taskCount = taskRes.deletedCount || 0;

        if (effectiveInjectFailureStep === "afterTasks") {
          throw new Error("Simulated failure after task deletion");
        }

        // 3. Delete child milestones scoped to both project and owner
        const milestoneRes = await Milestone.deleteMany(
          { project: projectId, owner: ownerId },
          { session }
        );
        milestoneCount = milestoneRes.deletedCount || 0;

        // 4. Delete child activities scoped to both project and owner
        const activityRes = await Activity.deleteMany(
          { project: projectId, owner: ownerId },
          { session }
        );
        activityCount = activityRes.deletedCount || 0;

        if (effectiveInjectFailureStep === "beforeProjectDelete") {
          throw new Error("Simulated failure before project deletion");
        }

        // 5. Delete project document as final commit step
        await Project.findOneAndDelete(
          { _id: projectId, owner: ownerId },
          { session }
        );
      });

      return {
        success: true,
        deletedId: projectId.toString(),
        transactional: true,
        cascadeStats: {
          tasksDeleted: taskCount,
          milestonesDeleted: milestoneCount,
          activitiesDeleted: activityCount,
        },
      };
    } finally {
      await session.endSession();
    }
  }

  // -------------------------------------------------------------------------
  // Branch B: Standalone MongoDB Fail-Closed Guard (No partial writes)
  // -------------------------------------------------------------------------
  // 1. Verify project exists and belongs to verified owner
  const project = await Project.findOne({
    _id: projectId,
    owner: ownerId,
  });

  if (!project) {
    const notFoundError = new Error("Project not found");
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  // 2. Fail closed without performing any document modifications
  const unsupportedError = new Error(
    "Atomic cascade deletion requires MongoDB transaction support (replica set or mongos). Standalone deployments are not supported."
  );
  unsupportedError.statusCode = 501;
  throw unsupportedError;
}
