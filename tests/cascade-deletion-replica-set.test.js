import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Load local environment safely if available
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not found or already loaded
}

import { DELETE as deleteProjectById } from "../src/app/api/projects/[id]/route.js";
import { POST as createTask } from "../src/app/api/projects/[id]/tasks/route.js";
import { POST as createMilestone } from "../src/app/api/projects/[id]/milestones/route.js";
import {
  checkTransactionSupport,
  executeProjectCascadeDeletion,
} from "../src/lib/api/project-cascade.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Milestone from "../src/models/Milestone.js";
import Activity from "../src/models/Activity.js";

describe("Phase 5B Step 1: Real MongoDB Transaction Integration Tests", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "7711228844";
  const mockOtherGithubId = "4488221177";

  const authorizedOwnerSession = {
    user: {
      name: "ReplicaSet Owner",
      email: "owner.replicaset@example.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Stranger Visitor",
      email: "stranger.replicaset@example.local",
      githubId: mockOtherGithubId,
    },
  };

  let testOwnerUser;
  let otherUser;
  let hasReplicaSupport = false;
  let skipReason = "";

  before(async () => {
    // 1. Determine connection target:
    // If MONGODB_REPLICA_TEST_URI is set, use it for genuine replica-set testing.
    // Otherwise fallback to MONGODB_URI to inspect the current deployment.
    const replicaUri = process.env.MONGODB_REPLICA_TEST_URI;
    const standardUri = process.env.MONGODB_URI;

    if (replicaUri) {
      process.env.MONGODB_URI = replicaUri;
    }

    if (!process.env.MONGODB_URI) {
      skipReason = "Neither MONGODB_REPLICA_TEST_URI nor MONGODB_URI is defined.";
      return;
    }

    // Disconnect any existing connection and reset cached state
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (global.mongoose) {
      global.mongoose.conn = null;
      global.mongoose.promise = null;
    }

    await connectToDatabase();
    await Project.init();
    await Task.init();
    await Milestone.init();
    await Activity.init();
    await User.init();

    // 2. Verify if the connected deployment genuinely supports multi-document transactions
    hasReplicaSupport = await checkTransactionSupport();

    if (!replicaUri) {
      skipReason =
        "Skipped: MONGODB_REPLICA_TEST_URI environment variable is not defined. The active local MongoDB instance is a standalone deployment that does not support transactions.";
    } else if (!hasReplicaSupport) {
      skipReason =
        "Skipped: Connected deployment at MONGODB_REPLICA_TEST_URI does not support transactions (standalone instance). A replica set is required.";
    }

    // Clean any prior test fixtures
    await User.deleteMany({
      githubId: { $in: [mockOwnerGithubId, mockOtherGithubId] },
    });

    testOwnerUser = await User.create({
      name: "ReplicaSet Owner",
      email: "owner.replicaset@example.local",
      githubId: mockOwnerGithubId,
    });

    otherUser = await User.create({
      name: "Stranger User",
      email: "stranger.replicaset@example.local",
      githubId: mockOtherGithubId,
    });
  });

  after(async () => {
    try {
      if (testOwnerUser?._id) {
        await Activity.deleteMany({ owner: testOwnerUser._id });
        await Milestone.deleteMany({ owner: testOwnerUser._id });
        await Task.deleteMany({ owner: testOwnerUser._id });
        await Project.deleteMany({ owner: testOwnerUser._id });
        await User.deleteOne({ _id: testOwnerUser._id });
      }
      if (otherUser?._id) {
        await Activity.deleteMany({ owner: otherUser._id });
        await Milestone.deleteMany({ owner: otherUser._id });
        await Task.deleteMany({ owner: otherUser._id });
        await Project.deleteMany({ owner: otherUser._id });
        await User.deleteOne({ _id: otherUser._id });
      }
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      if (global.mongoose) {
        global.mongoose.conn = null;
        global.mongoose.promise = null;
      }
      process.env = { ...originalEnv };
    }
  });

  beforeEach(() => {
    process.env = { ...originalEnv, OWNER_GITHUB_ID: mockOwnerGithubId };
    if (process.env.MONGODB_REPLICA_TEST_URI) {
      process.env.MONGODB_URI = process.env.MONGODB_REPLICA_TEST_URI;
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. Deployment Capability & Standalone Verification
  // =========================================================================
  describe("1. Deployment Capability & Standalone Safeguards", () => {
    it("reports the transaction capability of the active MongoDB deployment", async () => {
      const isCapable = await checkTransactionSupport();
      assert.equal(typeof isCapable, "boolean");

      if (!isCapable) {
        assert.equal(isCapable, false);
      } else {
        assert.equal(isCapable, true);
      }
    });

    it("verifies standalone deployment fails closed with HTTP 501 without modifying records", async (t) => {
      if (hasReplicaSupport) {
        t.skip("Skipped: Connected deployment supports transactions; standalone test not applicable.");
        return;
      }

      // Create a test project with child records
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Standalone Safety Project",
        slug: "standalone-safety-project",
        shortDescription: "Must not be modified on standalone",
      });

      await Task.create([
        { owner: testOwnerUser._id, project: project._id, title: "Task 1" },
        { owner: testOwnerUser._id, project: project._id, title: "Task 2" },
      ]);
      await Milestone.create([
        { owner: testOwnerUser._id, project: project._id, title: "Milestone 1" },
      ]);
      await Activity.create([
        {
          owner: testOwnerUser._id,
          project: project._id,
          type: "project_created",
          message: "Created test project",
        },
      ]);

      const req = new Request(`http://localhost:3000/api/projects/${project._id}`, {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;

      const res = await deleteProjectById(req, {
        params: Promise.resolve({ id: project._id.toString() }),
      });

      assert.equal(res.status, 501);
      const data = await res.json();
      assert.match(data.error, /Atomic cascade deletion requires MongoDB transaction support/i);

      // Verify zero modifications occurred
      const checkProj = await Project.findById(project._id);
      assert.ok(checkProj, "Project must remain intact");
      assert.equal(checkProj.isDeleting, false, "isDeleting flag must remain false");

      const taskCount = await Task.countDocuments({ project: project._id });
      assert.equal(taskCount, 2, "Tasks must remain intact");

      const msCount = await Milestone.countDocuments({ project: project._id });
      assert.equal(msCount, 1, "Milestones must remain intact");

      const actCount = await Activity.countDocuments({ project: project._id });
      assert.equal(actCount, 1, "Activities must remain intact");

      // Cleanup
      await Activity.deleteMany({ project: project._id });
      await Milestone.deleteMany({ project: project._id });
      await Task.deleteMany({ project: project._id });
      await Project.deleteOne({ _id: project._id });
    });
  });

  // =========================================================================
  // 2. Genuine Replica-Set Transaction Integration Tests
  // =========================================================================
  describe("2. Genuine Replica-Set Transaction Integration Tests", () => {
    it("executes atomic cascade deletion on replica set: removes project and all child records with zero orphans", async (t) => {
      if (!hasReplicaSupport) {
        t.skip(skipReason);
        return;
      }

      // 1. Create project with tasks, milestones, and activities on replica set
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Real Replica Set Project",
        slug: "real-replica-set-project",
        shortDescription: "Testing genuine atomic cascade deletion",
      });
      const projectId = project._id;

      await Task.create([
        { owner: testOwnerUser._id, project: projectId, title: "Task 1", priority: "High" },
        { owner: testOwnerUser._id, project: projectId, title: "Task 2", priority: "Medium" },
        { owner: testOwnerUser._id, project: projectId, title: "Task 3", priority: "Low" },
      ]);

      await Milestone.create([
        { owner: testOwnerUser._id, project: projectId, title: "Milestone 1", status: "Planned" },
        { owner: testOwnerUser._id, project: projectId, title: "Milestone 2", status: "In Progress" },
      ]);

      await Activity.create([
        {
          owner: testOwnerUser._id,
          project: projectId,
          type: "project_created",
          message: "Activity 1",
        },
        {
          owner: testOwnerUser._id,
          project: projectId,
          type: "task_created",
          message: "Activity 2",
        },
      ]);

      // 2. Execute deletion using genuine transaction support (no mocking or forcing)
      const deleteReq = new Request(`http://localhost:3000/api/projects/${projectId}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;

      const deleteRes = await deleteProjectById(deleteReq, {
        params: Promise.resolve({ id: projectId.toString() }),
      });

      assert.equal(deleteRes.status, 200);
      const resData = await deleteRes.json();
      assert.equal(resData.transactional, true);
      assert.equal(resData.deletedId, projectId.toString());
      assert.equal(resData.details.tasksDeleted, 3);
      assert.equal(resData.details.milestonesDeleted, 2);
      assert.equal(resData.details.activitiesDeleted, 2);

      // 3. Verify in database that all records are deleted atomically with no orphans
      const dbProj = await Project.findById(projectId);
      assert.equal(dbProj, null, "Project must be deleted");

      const remainingTasks = await Task.find({ project: projectId });
      assert.equal(remainingTasks.length, 0, "No orphaned tasks must remain");

      const remainingMilestones = await Milestone.find({ project: projectId });
      assert.equal(remainingMilestones.length, 0, "No orphaned milestones must remain");

      const remainingActivities = await Activity.find({ project: projectId });
      assert.equal(remainingActivities.length, 0, "No orphaned activities must remain");
    });

    it("rolls back multi-document transaction and restores all deleted child records on failure", async (t) => {
      if (!hasReplicaSupport) {
        t.skip(skipReason);
        return;
      }

      // 1. Create project with children
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Rollback Test Project",
        slug: "rollback-test-project",
        shortDescription: "Tests multi-document rollback on error",
      });
      const projectId = project._id;

      await Task.create([
        { owner: testOwnerUser._id, project: projectId, title: "Rollback Task 1" },
        { owner: testOwnerUser._id, project: projectId, title: "Rollback Task 2" },
      ]);
      await Milestone.create([
        { owner: testOwnerUser._id, project: projectId, title: "Rollback Milestone 1" },
      ]);
      await Activity.create([
        {
          owner: testOwnerUser._id,
          project: projectId,
          type: "project_created",
          message: "Rollback Activity",
        },
      ]);

      // 2. Trigger deletion with controlled mid-cascade failure
      // Failure occurs after Task, Milestone, and Activity deletions, before Project deletion
      await assert.rejects(
        async () => {
          await executeProjectCascadeDeletion({
            projectId,
            ownerId: testOwnerUser._id,
            _injectFailureStep: "beforeProjectDelete",
          });
        },
        { message: "Simulated failure before project deletion" }
      );

      // 3. Verify that the MongoDB transaction rolled back the earlier deletions
      const dbProj = await Project.findById(projectId);
      assert.ok(dbProj, "Project document must remain intact");

      const tasksAfterRollback = await Task.find({ project: projectId });
      assert.equal(
        tasksAfterRollback.length,
        2,
        "Tasks deleted within the transaction must be restored by rollback"
      );

      const msAfterRollback = await Milestone.find({ project: projectId });
      assert.equal(
        msAfterRollback.length,
        1,
        "Milestones deleted within the transaction must be restored by rollback"
      );

      const actAfterRollback = await Activity.find({ project: projectId });
      assert.equal(
        actAfterRollback.length,
        1,
        "Activities deleted within the transaction must be restored by rollback"
      );

      // Clean up fixtures
      await Activity.deleteMany({ project: projectId });
      await Milestone.deleteMany({ project: projectId });
      await Task.deleteMany({ project: projectId });
      await Project.deleteOne({ _id: projectId });
    });

    it("coordinates concurrent task creation and project deletion: leaves zero orphaned tasks", async (t) => {
      if (!hasReplicaSupport) {
        t.skip(skipReason);
        return;
      }

      // 1. Create project
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Concurrent Task Race Project",
        slug: "concurrent-task-race-project",
        shortDescription: "Tests concurrency between task creation and cascade deletion",
      });
      const projectId = project._id;

      // 2. Concurrently initiate project deletion and task creation
      const deleteReq = new Request(`http://localhost:3000/api/projects/${projectId}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;

      const taskReq = new Request(
        `http://localhost:3000/api/projects/${projectId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Race Candidate Task",
            priority: "High",
            status: "Todo",
          }),
        }
      );
      taskReq._testSession = authorizedOwnerSession;

      const [deleteResult, taskResult] = await Promise.allSettled([
        deleteProjectById(deleteReq, {
          params: Promise.resolve({ id: projectId.toString() }),
        }),
        createTask(taskReq, {
          params: Promise.resolve({ id: projectId.toString() }),
        }),
      ]);

      // 3. Evaluate results
      assert.equal(deleteResult.status, "fulfilled");
      assert.equal(taskResult.status, "fulfilled");

      const deleteRes = deleteResult.value;
      const taskRes = taskResult.value;

      // Deletion should succeed with 200
      assert.equal(deleteRes.status, 200);

      // Task creation should either:
      // a) Succeeded with 201 before deletion locked the project (and then was deleted by the cascade)
      // b) Rejected with 404 because deletion marked isDeleting: true first
      assert.ok(
        taskRes.status === 201 || taskRes.status === 404,
        `Task creation response status must be 201 or 404, got ${taskRes.status}`
      );

      // 4. Critical invariant: Project must not exist and ZERO tasks must remain in database
      const dbProj = await Project.findById(projectId);
      assert.equal(dbProj, null, "Project must be deleted");

      const orphanedTasks = await Task.find({ project: projectId });
      assert.equal(
        orphanedTasks.length,
        0,
        "No orphaned tasks may remain regardless of concurrency race winner"
      );
    });

    it("coordinates concurrent milestone creation and project deletion: leaves zero orphaned milestones", async (t) => {
      if (!hasReplicaSupport) {
        t.skip(skipReason);
        return;
      }

      // 1. Create project
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Concurrent Milestone Race Project",
        slug: "concurrent-ms-race-project",
        shortDescription: "Tests concurrency between milestone creation and cascade deletion",
      });
      const projectId = project._id;

      // 2. Concurrently initiate project deletion and milestone creation
      const deleteReq = new Request(`http://localhost:3000/api/projects/${projectId}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;

      const msReq = new Request(
        `http://localhost:3000/api/projects/${projectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Race Candidate Milestone",
            status: "Planned",
          }),
        }
      );
      msReq._testSession = authorizedOwnerSession;

      const [deleteResult, msResult] = await Promise.allSettled([
        deleteProjectById(deleteReq, {
          params: Promise.resolve({ id: projectId.toString() }),
        }),
        createMilestone(msReq, {
          params: Promise.resolve({ id: projectId.toString() }),
        }),
      ]);

      assert.equal(deleteResult.status, "fulfilled");
      assert.equal(msResult.status, "fulfilled");

      const deleteRes = deleteResult.value;
      const msRes = msResult.value;

      assert.equal(deleteRes.status, 200);
      assert.ok(
        msRes.status === 201 || msRes.status === 404,
        `Milestone creation response status must be 201 or 404, got ${msRes.status}`
      );

      // Critical invariant: Zero orphaned milestones
      const dbProj = await Project.findById(projectId);
      assert.equal(dbProj, null, "Project must be deleted");

      const orphanedMilestones = await Milestone.find({ project: projectId });
      assert.equal(
        orphanedMilestones.length,
        0,
        "No orphaned milestones may remain regardless of concurrency race winner"
      );
    });

    it("verifies repeated deletion returns 404 and multi-tenant isolation prevents cross-owner deletion", async (t) => {
      if (!hasReplicaSupport) {
        t.skip(skipReason);
        return;
      }

      // 1. Create project for testOwnerUser
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Repeated Deletion Project",
        slug: "repeated-deletion-project",
        shortDescription: "Tests repeat DELETE and IDOR isolation",
      });

      // First DELETE: succeeds (200)
      const req1 = new Request(`http://localhost:3000/api/projects/${project._id}`, {
        method: "DELETE",
      });
      req1._testSession = authorizedOwnerSession;
      const res1 = await deleteProjectById(req1, {
        params: Promise.resolve({ id: project._id.toString() }),
      });
      assert.equal(res1.status, 200);

      // Second DELETE: already deleted, returns 404
      const req2 = new Request(`http://localhost:3000/api/projects/${project._id}`, {
        method: "DELETE",
      });
      req2._testSession = authorizedOwnerSession;
      const res2 = await deleteProjectById(req2, {
        params: Promise.resolve({ id: project._id.toString() }),
      });
      assert.equal(res2.status, 404);

      // 2. IDOR Prevention: Other user's project cannot be deleted by testOwnerUser
      const otherProject = await Project.create({
        owner: otherUser._id,
        title: "Stranger Protected Project",
        slug: "stranger-protected-project",
        shortDescription: "Must not be deleted by unauthorized user",
      });

      const idorReq = new Request(`http://localhost:3000/api/projects/${otherProject._id}`, {
        method: "DELETE",
      });
      idorReq._testSession = authorizedOwnerSession;
      const idorRes = await deleteProjectById(idorReq, {
        params: Promise.resolve({ id: otherProject._id.toString() }),
      });
      assert.equal(idorRes.status, 404);

      // Verify stranger's project remains intact in database
      const checkOther = await Project.findById(otherProject._id);
      assert.ok(checkOther);
      await Project.deleteOne({ _id: otherProject._id });
    });
  });
});
