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
  getTestHook,
  resolveTransactionSupport,
} from "../src/lib/api/project-cascade.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Milestone from "../src/models/Milestone.js";
import Activity from "../src/models/Activity.js";

describe("Phase 4B Step 6: Transaction-Safe Cascade Deletion & Concurrency Coordination", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "7766554433";
  const mockOtherGithubId = "3344556677";

  const authorizedOwnerSession = {
    user: {
      name: "Cascade Owner",
      email: "owner.cascade@example.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Non-Owner Visitor",
      email: "visitor.cascade@example.local",
      githubId: mockOtherGithubId,
    },
  };

  let testOwnerUser;
  let otherUser;

  before(async () => {
    if (!process.env.MONGODB_URI) return;

    await connectToDatabase();
    await Project.init();
    await Task.init();
    await Milestone.init();
    await Activity.init();
    await User.init();

    // Clean existing test fixtures
    await User.deleteMany({
      githubId: { $in: [mockOwnerGithubId, mockOtherGithubId] },
    });

    testOwnerUser = await User.create({
      name: "Cascade Owner",
      email: "owner.cascade@example.local",
      githubId: mockOwnerGithubId,
    });

    otherUser = await User.create({
      name: "Other User",
      email: "other.cascade@example.local",
      githubId: mockOtherGithubId,
    });
  });

  after(async () => {
    if (!process.env.MONGODB_URI) return;
    try {
      if (testOwnerUser?._id) {
        await Task.deleteMany({ owner: testOwnerUser._id });
        await Milestone.deleteMany({ owner: testOwnerUser._id });
        await Activity.deleteMany({ owner: testOwnerUser._id });
        await Project.deleteMany({ owner: testOwnerUser._id });
        await User.deleteOne({ _id: testOwnerUser._id });
      }
      if (otherUser?._id) {
        await Task.deleteMany({ owner: otherUser._id });
        await Milestone.deleteMany({ owner: otherUser._id });
        await Activity.deleteMany({ owner: otherUser._id });
        await Project.deleteMany({ owner: otherUser._id });
        await User.deleteOne({ _id: otherUser._id });
      }
    } finally {
      await mongoose.disconnect();
    }
  });

  beforeEach(() => {
    process.env = { ...originalEnv, OWNER_GITHUB_ID: mockOwnerGithubId };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. Authorization & Parameter Validation (Offline / Unit Tests)
  // =========================================================================
  describe("1. Authorization & Parameter Validation Boundaries (Offline / Unit Tests)", () => {
    const validObjectId = "507f1f77bcf86cd799439011";

    it("returns 401 when visitor is unauthenticated (no session)", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${validObjectId}`, {
        method: "DELETE",
      });
      const res = await deleteProjectById(req, { params: { id: validObjectId } });
      assert.equal(res.status, 401);
      assert.match((await res.json()).error, /Authentication required/i);
    });

    it("returns 403 when authenticated as a non-owner visitor", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${validObjectId}`, {
        method: "DELETE",
      });
      req._testSession = unauthorizedVisitorSession;
      const res = await deleteProjectById(req, { params: { id: validObjectId } });
      assert.equal(res.status, 403);
      assert.match((await res.json()).error, /Owner authorization required/i);
    });

    it("returns 400 for malformed project ID format", async () => {
      const req = new Request("http://localhost:3000/api/projects/not-an-object-id", {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;
      const res = await deleteProjectById(req, { params: { id: "not-an-object-id" } });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /Invalid project ID format/i);
    });
  });

  // =========================================================================
  // 2. Standalone MongoDB Fail-Closed & Concurrency Guards (Genuine Integration Tests)
  // =========================================================================
  describe("2. Standalone MongoDB Fail-Closed & Concurrency Guards (Genuine Local Integration Tests)", () => {

    it("confirms that the current standalone MongoDB deployment does not support transactions", async () => {
      if (!process.env.MONGODB_URI) return;
      const hasTxSupport = await checkTransactionSupport();
      // On local standalone Community Server without replica set, this is false
      assert.equal(hasTxSupport, false);
    });

    it("returns 404 when attempting to delete a nonexistent project on standalone MongoDB", async () => {
      if (!process.env.MONGODB_URI) return;

      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const req = new Request(`http://localhost:3000/api/projects/${nonExistentId}`, {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;
      const res = await deleteProjectById(req, { params: { id: nonExistentId } });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);
    });

    it("returns 404 when attempting to delete another owner's project (IDOR prevention on standalone)", async () => {
      if (!process.env.MONGODB_URI) return;

      const otherProject = await Project.create({
        owner: otherUser._id,
        title: "Other User Project to Protect",
        slug: "other-user-project-protect-standalone",
        shortDescription: "Must not be deleted by testOwnerUser",
      });

      const req = new Request(`http://localhost:3000/api/projects/${otherProject._id}`, {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;
      const res = await deleteProjectById(req, {
        params: { id: otherProject._id.toString() },
      });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);

      // Verify other owner's project remains untouched in live database
      const checkOther = await Project.findById(otherProject._id);
      assert.ok(checkOther);
      await Project.deleteOne({ _id: otherProject._id });
    });

    it("fails closed with HTTP 501 on standalone MongoDB, performing ZERO writes or deletions", async () => {
      if (!process.env.MONGODB_URI) return;

      // 1. Create a project with children on the live standalone MongoDB
      const liveProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Standalone Fail-Closed Project",
        slug: "standalone-fail-closed-project",
        shortDescription: "Must not be partially deleted on standalone MongoDB",
      });

      const projectId = liveProject._id;

      await Task.create([
        { owner: testOwnerUser._id, project: projectId, title: "Task 1" },
        { owner: testOwnerUser._id, project: projectId, title: "Task 2" },
      ]);

      await Milestone.create([
        { owner: testOwnerUser._id, project: projectId, title: "Milestone 1" },
      ]);

      await Activity.create([
        {
          owner: testOwnerUser._id,
          project: projectId,
          type: "project_created",
          message: "Created standalone project",
        },
      ]);

      // 2. Request DELETE /api/projects/[id]
      const req = new Request(`http://localhost:3000/api/projects/${projectId}`, {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;
      const res = await deleteProjectById(req, {
        params: { id: projectId.toString() },
      });

      // 3. Verify HTTP 501 Not Implemented response
      assert.equal(res.status, 501);
      const data = await res.json();
      assert.match(
        data.error,
        /Atomic cascade deletion requires MongoDB transaction support/i
      );

      // 4. Verify ZERO modifications occurred in live database (Fail-closed verification)
      const projectStillExists = await Project.findById(projectId);
      assert.ok(projectStillExists, "Parent project must remain completely intact");
      assert.equal(projectStillExists.isDeleting, false, "isDeleting flag must not be altered");

      const remainingTasks = await Task.find({ project: projectId });
      assert.equal(remainingTasks.length, 2, "Tasks must not be deleted");

      const remainingMilestones = await Milestone.find({ project: projectId });
      assert.equal(remainingMilestones.length, 1, "Milestones must not be deleted");

      const remainingActivities = await Activity.find({ project: projectId });
      assert.equal(remainingActivities.length, 1, "Activities must not be deleted");

      // Cleanup
      await Task.deleteMany({ project: projectId });
      await Milestone.deleteMany({ project: projectId });
      await Activity.deleteMany({ project: projectId });
      await Project.deleteOne({ _id: projectId });
    });

    it("repeated DELETE requests on standalone MongoDB return 501 consistently without side-effects", async () => {
      if (!process.env.MONGODB_URI) return;

      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Repeated Delete Standalone Project",
        slug: "repeated-delete-standalone-project",
        shortDescription: "Tests repeated DELETE calls",
      });

      // Request 1
      const req1 = new Request(`http://localhost:3000/api/projects/${project._id}`, {
        method: "DELETE",
      });
      req1._testSession = authorizedOwnerSession;
      const res1 = await deleteProjectById(req1, { params: { id: project._id.toString() } });
      assert.equal(res1.status, 501);

      // Request 2
      const req2 = new Request(`http://localhost:3000/api/projects/${project._id}`, {
        method: "DELETE",
      });
      req2._testSession = authorizedOwnerSession;
      const res2 = await deleteProjectById(req2, { params: { id: project._id.toString() } });
      assert.equal(res2.status, 501);

      // Parent document still intact
      const checkProj = await Project.findById(project._id);
      assert.ok(checkProj);

      await Project.deleteOne({ _id: project._id });
    });

    it("rejects task creation when parent project has isDeleting: true (standalone concurrency guard)", async () => {
      if (!process.env.MONGODB_URI) return;

      // Project marked as deleting
      const deletingProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Deleting Project for Task Test",
        slug: "deleting-project-task-test",
        shortDescription: "Simulates project being deleted",
        isDeleting: true,
      });

      const req = new Request(
        `http://localhost:3000/api/projects/${deletingProject._id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Orphan Candidate Task" }),
        }
      );
      req._testSession = authorizedOwnerSession;

      const res = await createTask(req, {
        params: { id: deletingProject._id.toString() },
      });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);

      // Verify no task was saved in live MongoDB
      const count = await Task.countDocuments({ project: deletingProject._id });
      assert.equal(count, 0, "No orphaned task must be inserted under a deleting project");

      await Project.deleteOne({ _id: deletingProject._id });
    });

    it("rejects milestone creation when parent project has isDeleting: true (standalone concurrency guard)", async () => {
      if (!process.env.MONGODB_URI) return;

      // Project marked as deleting
      const deletingProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Deleting Project for Milestone Test",
        slug: "deleting-project-milestone-test",
        shortDescription: "Simulates project being deleted",
        isDeleting: true,
      });

      const req = new Request(
        `http://localhost:3000/api/projects/${deletingProject._id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Orphan Candidate Milestone" }),
        }
      );
      req._testSession = authorizedOwnerSession;

      const res = await createMilestone(req, {
        params: { id: deletingProject._id.toString() },
      });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);

      // Verify no milestone was saved in live MongoDB
      const count = await Milestone.countDocuments({ project: deletingProject._id });
      assert.equal(count, 0, "No orphaned milestone must be inserted under a deleting project");

      await Project.deleteOne({ _id: deletingProject._id });
    });

    it("rejects child creation after a project has been deleted", async () => {
      if (!process.env.MONGODB_URI) return;

      const deletedId = new mongoose.Types.ObjectId().toString();

      // Task creation attempt
      const taskReq = new Request(
        `http://localhost:3000/api/projects/${deletedId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Task for Nonexistent Project" }),
        }
      );
      taskReq._testSession = authorizedOwnerSession;
      const taskRes = await createTask(taskReq, { params: { id: deletedId } });
      assert.equal(taskRes.status, 404);

      // Milestone creation attempt
      const msReq = new Request(
        `http://localhost:3000/api/projects/${deletedId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Milestone for Nonexistent Project" }),
        }
      );
      msReq._testSession = authorizedOwnerSession;
      const msRes = await createMilestone(msReq, { params: { id: deletedId } });
      assert.equal(msRes.status, 404);
    });

    it("preserves regular task and milestone creation when parent project is not deleting", async () => {
      if (!process.env.MONGODB_URI) return;

      const normalProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Normal Active Project",
        slug: "normal-active-project",
        shortDescription: "Regression verification for active projects",
      });

      // 1. Create task
      const taskReq = new Request(
        `http://localhost:3000/api/projects/${normalProject._id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Active Project Task", priority: "High" }),
        }
      );
      taskReq._testSession = authorizedOwnerSession;
      const taskRes = await createTask(taskReq, {
        params: { id: normalProject._id.toString() },
      });
      assert.equal(taskRes.status, 201);
      const taskData = await taskRes.json();
      assert.equal(taskData.task.title, "Active Project Task");
      assert.equal(taskData.task.priority, "High");

      // 2. Create milestone
      const msReq = new Request(
        `http://localhost:3000/api/projects/${normalProject._id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Active Project Milestone" }),
        }
      );
      msReq._testSession = authorizedOwnerSession;
      const msRes = await createMilestone(msReq, {
        params: { id: normalProject._id.toString() },
      });
      assert.equal(msRes.status, 201);
      const msData = await msRes.json();
      assert.equal(msData.milestone.title, "Active Project Milestone");

      // Cleanup
      await Task.deleteMany({ project: normalProject._id });
      await Milestone.deleteMany({ project: normalProject._id });
      await Project.deleteOne({ _id: normalProject._id });
    });
  });

  // =========================================================================
  // 3. Mocked Transaction Coordination & Rollback Lifecycle (Mock-Based Tests)
  // =========================================================================
  describe("3. Transaction Coordination & Rollback Lifecycle (Mock-Based Tests)", () => {
    let originalStartSession;
    let originalFindOneAndUpdate;
    let originalFindOneAndDelete;
    let originalTaskDeleteMany;
    let originalMsDeleteMany;
    let originalActDeleteMany;
    let originalTaskSave;
    let originalMsSave;

    beforeEach(() => {
      originalStartSession = mongoose.startSession;
      originalFindOneAndUpdate = Project.findOneAndUpdate;
      originalFindOneAndDelete = Project.findOneAndDelete;
      originalTaskDeleteMany = Task.deleteMany;
      originalMsDeleteMany = Milestone.deleteMany;
      originalActDeleteMany = Activity.deleteMany;
      originalTaskSave = Task.prototype.save;
      originalMsSave = Milestone.prototype.save;
    });

    afterEach(() => {
      mongoose.startSession = originalStartSession;
      Project.findOneAndUpdate = originalFindOneAndUpdate;
      Project.findOneAndDelete = originalFindOneAndDelete;
      Task.deleteMany = originalTaskDeleteMany;
      Milestone.deleteMany = originalMsDeleteMany;
      Activity.deleteMany = originalActDeleteMany;
      Task.prototype.save = originalTaskSave;
      Milestone.prototype.save = originalMsSave;
    });

    it("executes full transactional cascade deletion when transaction support is enabled", async () => {
      const targetProjectId = new mongoose.Types.ObjectId();
      const targetOwnerId = new mongoose.Types.ObjectId();
      const calls = [];

      let sessionCommitted = false;
      let sessionEnded = false;

      const mockSession = {
        async withTransaction(fn) {
          const result = await fn();
          sessionCommitted = true;
          return result;
        },
        async endSession() {
          sessionEnded = true;
        },
      };

      mongoose.startSession = async () => mockSession;

      Project.findOneAndUpdate = async (filter, update, options) => {
        calls.push({ op: "findOneAndUpdate", filter, update, options });
        return { _id: targetProjectId, owner: targetOwnerId, isDeleting: true };
      };

      Task.deleteMany = async (filter, options) => {
        calls.push({ op: "taskDeleteMany", filter, options });
        return { deletedCount: 3 };
      };

      Milestone.deleteMany = async (filter, options) => {
        calls.push({ op: "milestoneDeleteMany", filter, options });
        return { deletedCount: 2 };
      };

      Activity.deleteMany = async (filter, options) => {
        calls.push({ op: "activityDeleteMany", filter, options });
        return { deletedCount: 4 };
      };

      Project.findOneAndDelete = async (filter, options) => {
        calls.push({ op: "projectFindOneAndDelete", filter, options });
        return { _id: targetProjectId };
      };

      const result = await executeProjectCascadeDeletion({
        projectId: targetProjectId,
        ownerId: targetOwnerId,
        forceTransactionSupport: true,
      });

      assert.equal(result.success, true);
      assert.equal(result.transactional, true);
      assert.equal(result.deletedId, targetProjectId.toString());
      assert.equal(result.cascadeStats.tasksDeleted, 3);
      assert.equal(result.cascadeStats.milestonesDeleted, 2);
      assert.equal(result.cascadeStats.activitiesDeleted, 4);
      assert.equal(sessionCommitted, true);
      assert.equal(sessionEnded, true);

      // Verify sequence of atomic operations
      assert.equal(calls[0].op, "findOneAndUpdate");
      assert.deepEqual(calls[0].filter, {
        _id: targetProjectId,
        owner: targetOwnerId,
        isDeleting: { $ne: true },
      });
      assert.deepEqual(calls[0].update, { $set: { isDeleting: true } });
      assert.equal(calls[0].options.session, mockSession);

      assert.equal(calls[1].op, "taskDeleteMany");
      assert.equal(calls[1].options.session, mockSession);

      assert.equal(calls[2].op, "milestoneDeleteMany");
      assert.equal(calls[2].options.session, mockSession);

      assert.equal(calls[3].op, "activityDeleteMany");
      assert.equal(calls[3].options.session, mockSession);

      assert.equal(calls[4].op, "projectFindOneAndDelete");
      assert.equal(calls[4].options.session, mockSession);
    });

    it("rolls back transaction and does not delete project document when a mid-cascade error occurs", async () => {
      const targetProjectId = new mongoose.Types.ObjectId();
      const targetOwnerId = new mongoose.Types.ObjectId();

      let transactionAborted = false;
      let sessionEnded = false;
      let projectDocumentDeleted = false;

      const mockSession = {
        async withTransaction(fn) {
          try {
            return await fn();
          } catch (err) {
            transactionAborted = true;
            throw err;
          }
        },
        async endSession() {
          sessionEnded = true;
        },
      };

      mongoose.startSession = async () => mockSession;

      Project.findOneAndUpdate = async () => ({
        _id: targetProjectId,
        owner: targetOwnerId,
        isDeleting: true,
      });

      Task.deleteMany = async () => ({ deletedCount: 1 });
      Milestone.deleteMany = async () => ({ deletedCount: 1 });
      Activity.deleteMany = async () => ({ deletedCount: 1 });

      Project.findOneAndDelete = async () => {
        projectDocumentDeleted = true;
        return { _id: targetProjectId };
      };

      await assert.rejects(
        async () => {
          await executeProjectCascadeDeletion({
            projectId: targetProjectId,
            ownerId: targetOwnerId,
            forceTransactionSupport: true,
            _injectFailureStep: "beforeProjectDelete",
          });
        },
        { message: "Simulated failure before project deletion" }
      );

      assert.equal(transactionAborted, true, "Transaction must abort on error");
      assert.equal(sessionEnded, true, "Session must end cleanly");
      assert.equal(
        projectDocumentDeleted,
        false,
        "Parent project document must NOT be deleted when mid-cascade failure occurs"
      );
    });

    it("serializes task creation against cascade deletion: aborts task creation when parent isDeleting: true", async () => {
      const targetProjectId = new mongoose.Types.ObjectId().toString();
      let taskSaved = false;

      const mockSession = {
        async withTransaction(fn) {
          return await fn();
        },
        async endSession() {},
      };

      mongoose.startSession = async () => mockSession;

      // Project.findOneAndUpdate returns null when isDeleting is already true
      Project.findOneAndUpdate = async () => null;

      Task.prototype.save = async function () {
        taskSaved = true;
      };

      const req = new Request(`http://localhost:3000/api/projects/${targetProjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Race Candidate Task" }),
      });
      req._testSession = authorizedOwnerSession;
      req._testForceTxSupport = true;

      const res = await createTask(req, { params: { id: targetProjectId } });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);
      assert.equal(taskSaved, false, "Task must never be saved when parent is deleting");
    });

    it("serializes milestone creation against cascade deletion: aborts milestone creation when parent isDeleting: true", async () => {
      const targetProjectId = new mongoose.Types.ObjectId().toString();
      let milestoneSaved = false;

      const mockSession = {
        async withTransaction(fn) {
          return await fn();
        },
        async endSession() {},
      };

      mongoose.startSession = async () => mockSession;

      // Project.findOneAndUpdate returns null when isDeleting is already true
      Project.findOneAndUpdate = async () => null;

      Milestone.prototype.save = async function () {
        milestoneSaved = true;
      };

      const req = new Request(
        `http://localhost:3000/api/projects/${targetProjectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Race Candidate Milestone" }),
        }
      );
      req._testSession = authorizedOwnerSession;
      req._testForceTxSupport = true;

      const res = await createMilestone(req, { params: { id: targetProjectId } });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);
      assert.equal(milestoneSaved, false, "Milestone must never be saved when parent is deleting");
    });

    it("rolls back task creation transaction if child insert fails after parent lock", async () => {
      const targetProjectId = new mongoose.Types.ObjectId().toString();
      let parentLocked = false;
      let transactionAborted = false;

      const mockSession = {
        async withTransaction(fn) {
          try {
            return await fn();
          } catch (err) {
            transactionAborted = true;
            throw err;
          }
        },
        async endSession() {},
      };

      mongoose.startSession = async () => mockSession;

      Project.findOneAndUpdate = async () => {
        parentLocked = true;
        return { _id: targetProjectId, isDeleting: false };
      };

      const req = new Request(`http://localhost:3000/api/projects/${targetProjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Failing Task" }),
      });
      req._testSession = authorizedOwnerSession;
      req._testForceTxSupport = true;
      req._testInjectFailureStep = "afterParentLock";

      const res = await createTask(req, { params: { id: targetProjectId } });
      assert.equal(res.status, 500);
      assert.equal(parentLocked, true);
      assert.equal(transactionAborted, true);
    });

    it("rolls back milestone creation transaction if child insert fails after parent lock", async () => {
      const targetProjectId = new mongoose.Types.ObjectId().toString();
      let parentLocked = false;
      let transactionAborted = false;

      const mockSession = {
        async withTransaction(fn) {
          try {
            return await fn();
          } catch (err) {
            transactionAborted = true;
            throw err;
          }
        },
        async endSession() {},
      };

      mongoose.startSession = async () => mockSession;

      Project.findOneAndUpdate = async () => {
        parentLocked = true;
        return { _id: targetProjectId, isDeleting: false };
      };

      const req = new Request(
        `http://localhost:3000/api/projects/${targetProjectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Failing Milestone" }),
        }
      );
      req._testSession = authorizedOwnerSession;
      req._testForceTxSupport = true;
      req._testInjectFailureStep = "afterParentLock";

      const res = await createMilestone(req, { params: { id: targetProjectId } });
      assert.equal(res.status, 500);
      assert.equal(parentLocked, true);
      assert.equal(transactionAborted, true);
    });

    it("verifies repeated DELETE on transactional deployment returns 404 after successful first delete", async () => {
      const targetProjectId = new mongoose.Types.ObjectId();
      const targetOwnerId = new mongoose.Types.ObjectId();
      let projectDeleted = false;

      const mockSession = {
        async withTransaction(fn) {
          return await fn();
        },
        async endSession() {},
      };

      mongoose.startSession = async () => mockSession;

      Project.findOneAndUpdate = async () => {
        if (projectDeleted) return null;
        projectDeleted = true;
        return { _id: targetProjectId, owner: targetOwnerId, isDeleting: true };
      };

      Task.deleteMany = async () => ({ deletedCount: 0 });
      Milestone.deleteMany = async () => ({ deletedCount: 0 });
      Activity.deleteMany = async () => ({ deletedCount: 0 });
      Project.findOneAndDelete = async () => ({ _id: targetProjectId });

      // First DELETE: succeeds
      const res1 = await executeProjectCascadeDeletion({
        projectId: targetProjectId,
        ownerId: targetOwnerId,
        forceTransactionSupport: true,
      });
      assert.equal(res1.success, true);

      // Second DELETE: project already deleted, returns 404
      await assert.rejects(
        async () => {
          await executeProjectCascadeDeletion({
            projectId: targetProjectId,
            ownerId: targetOwnerId,
            forceTransactionSupport: true,
          });
        },
        { statusCode: 404, message: "Project not found" }
      );
    });
  });

  // =========================================================================
  // 4. Production Security Hardening of Transaction Test Hooks
  // =========================================================================
  describe("4. Production Security Hardening of Transaction Test Hooks", () => {
    let originalStartSession;
    let originalFindOneAndUpdate;
    let originalFindOneAndDelete;
    let originalTaskDeleteMany;
    let originalMsDeleteMany;
    let originalActDeleteMany;
    let originalTaskSave;
    let originalMsSave;

    beforeEach(() => {
      originalStartSession = mongoose.startSession;
      originalFindOneAndUpdate = Project.findOneAndUpdate;
      originalFindOneAndDelete = Project.findOneAndDelete;
      Task.deleteMany && (originalTaskDeleteMany = Task.deleteMany);
      Milestone.deleteMany && (originalMsDeleteMany = Milestone.deleteMany);
      Activity.deleteMany && (originalActDeleteMany = Activity.deleteMany);
      Task.prototype.save && (originalTaskSave = Task.prototype.save);
      Milestone.prototype.save && (originalMsSave = Milestone.prototype.save);
    });

    afterEach(() => {
      mongoose.startSession = originalStartSession;
      Project.findOneAndUpdate = originalFindOneAndUpdate;
      Project.findOneAndDelete = originalFindOneAndDelete;
      if (originalTaskDeleteMany) Task.deleteMany = originalTaskDeleteMany;
      if (originalMsDeleteMany) Milestone.deleteMany = originalMsDeleteMany;
      if (originalActDeleteMany) Activity.deleteMany = originalActDeleteMany;
      if (originalTaskSave) Task.prototype.save = originalTaskSave;
      if (originalMsSave) Milestone.prototype.save = originalMsSave;
    });

    describe("A. Pure Unit Contracts (getTestHook & resolveTransactionSupport)", () => {
      it("ignores injected test hooks in production environment (NODE_ENV=production)", () => {
        process.env.NODE_ENV = "production";

        const req = {
          _testForceTxSupport: true,
          _testInjectFailureStep: "afterParentLock",
        };

        assert.equal(getTestHook(req, "_testForceTxSupport"), null);
        assert.equal(getTestHook(req, "_testInjectFailureStep"), null);
        assert.equal(getTestHook(req, "_testNonexistent", "defaultVal"), "defaultVal");
      });

      it("honors injected test hooks outside production environment (NODE_ENV=test)", () => {
        process.env.NODE_ENV = "test";

        const req = {
          _testForceTxSupport: true,
          _testInjectFailureStep: "afterParentLock",
        };

        assert.equal(getTestHook(req, "_testForceTxSupport"), true);
        assert.equal(getTestHook(req, "_testInjectFailureStep"), "afterParentLock");
      });

      it("resolveTransactionSupport queries real deployment in production, ignoring _testForceTxSupport", async () => {
        process.env.NODE_ENV = "production";

        const req = { _testForceTxSupport: true };
        const realDeploymentSupport = await checkTransactionSupport();

        const resolved = await resolveTransactionSupport(req);
        assert.equal(resolved, realDeploymentSupport);
      });

      it("resolveTransactionSupport honors _testForceTxSupport outside production", async () => {
        process.env.NODE_ENV = "test";

        const reqForcedTrue = { _testForceTxSupport: true };
        assert.equal(await resolveTransactionSupport(reqForcedTrue), true);

        const reqForcedFalse = { _testForceTxSupport: false };
        assert.equal(await resolveTransactionSupport(reqForcedFalse), false);
      });
    });

    describe("B. Service-Level Production Guards (executeProjectCascadeDeletion)", () => {
      it("ignores forceTransactionSupport in production and fails closed on standalone MongoDB (genuine local integration)", async () => {
        process.env.NODE_ENV = "production";

        // Create a genuine test project in MongoDB
        const testProject = await Project.create({
          owner: testOwnerUser._id,
          title: "Production Guard Safety Test",
          slug: "production-guard-safety-test",
          shortDescription: "Ensures forced transaction flags are ignored in production",
        });

        const isRealReplica = await checkTransactionSupport();
        if (!isRealReplica) {
          // On genuine standalone MongoDB, passing forceTransactionSupport: true in production MUST STILL FAIL CLOSED (501)
          await assert.rejects(
            async () => {
              await executeProjectCascadeDeletion({
                projectId: testProject._id,
                ownerId: testOwnerUser._id,
                forceTransactionSupport: true, // MUST BE IGNORED
              });
            },
            { statusCode: 501 }
          );

          // Verify project was NOT deleted
          const stillExists = await Project.findById(testProject._id);
          assert.ok(stillExists, "Project must not be deleted on standalone MongoDB in production");
        }

        await Project.deleteOne({ _id: testProject._id });
      });

      it("ignores _injectFailureStep in production during cascade deletion (mocked transaction)", async () => {
        process.env.NODE_ENV = "production";

        const targetProjectId = new mongoose.Types.ObjectId();
        const targetOwnerId = new mongoose.Types.ObjectId();

        const mockSession = {
          async withTransaction(fn) {
            return await fn();
          },
          async endSession() {},
        };

        mongoose.startSession = async () => mockSession;

        Project.findOneAndUpdate = async () => ({
          _id: targetProjectId,
          owner: targetOwnerId,
          isDeleting: true,
        });

        Task.deleteMany = async () => ({ deletedCount: 1 });
        Milestone.deleteMany = async () => ({ deletedCount: 1 });
        Activity.deleteMany = async () => ({ deletedCount: 1 });
        Project.findOneAndDelete = async () => ({ _id: targetProjectId });

        // Temporarily mock checkTransactionSupport to simulate a transaction-capable deployment
        const originalConnectionDb = mongoose.connection.db;
        const mockAdminDb = {
          admin: () => ({
            command: async () => ({ setName: "rs0" }),
          }),
        };
        mongoose.connection.db = mockAdminDb;

        try {
          // In production, _injectFailureStep MUST BE IGNORED; it should NOT throw "Simulated failure before task deletion"
          const result = await executeProjectCascadeDeletion({
            projectId: targetProjectId,
            ownerId: targetOwnerId,
            _injectFailureStep: "beforeTasks", // MUST BE IGNORED
          });

          assert.equal(result.success, true);
          assert.equal(result.cascadeStats.tasksDeleted, 1);
        } finally {
          mongoose.connection.db = originalConnectionDb;
        }
      });
    });

    describe("C. Route-Handler Level Production Guards (DELETE, Task POST, Milestone POST)", () => {
      it("DELETE /api/projects/[id] in production fails closed with 401 on injected session, preventing unauthorized execution", async () => {
        process.env.NODE_ENV = "production";

        const testProject = await Project.create({
          owner: testOwnerUser._id,
          title: "Route Guard Project",
          slug: "route-guard-project",
          shortDescription: "Must ignore injected test hooks in route handler in production",
        });

        const req = new Request(`http://localhost:3000/api/projects/${testProject._id}`, {
          method: "DELETE",
        });
        req._testSession = authorizedOwnerSession;
        req._testForceTxSupport = true; // MUST BE IGNORED in production

        const res = await deleteProjectById(req, { params: { id: testProject._id.toString() } });
        // In production, injected session is rejected by checkOwnerAccess, failing closed with 401
        assert.equal(res.status, 401);
        assert.match((await res.json()).error, /Authentication required/i);

        const projectStillPresent = await Project.findById(testProject._id);
        assert.ok(projectStillPresent, "Project must not be deleted");

        await Project.deleteOne({ _id: testProject._id });
      });

      it("POST /api/projects/[id]/tasks in production fails closed with 401 on injected session, preventing unauthorized execution", async () => {
        process.env.NODE_ENV = "production";

        const targetProjectId = new mongoose.Types.ObjectId().toString();
        const req = new Request(`http://localhost:3000/api/projects/${targetProjectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Task With Injected Session In Production" }),
        });
        req._testSession = authorizedOwnerSession;
        req._testInjectFailureStep = "afterParentLock"; // MUST BE IGNORED in production

        const res = await createTask(req, { params: { id: targetProjectId } });
        assert.equal(res.status, 401);
        assert.match((await res.json()).error, /Authentication required/i);
      });

      it("POST /api/projects/[id]/milestones in production fails closed with 401 on injected session, preventing unauthorized execution", async () => {
        process.env.NODE_ENV = "production";

        const targetProjectId = new mongoose.Types.ObjectId().toString();
        const req = new Request(`http://localhost:3000/api/projects/${targetProjectId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Milestone With Injected Session In Production" }),
        });
        req._testSession = authorizedOwnerSession;
        req._testInjectFailureStep = "afterParentLock"; // MUST BE IGNORED in production

        const res = await createMilestone(req, { params: { id: targetProjectId } });
        assert.equal(res.status, 401);
        assert.match((await res.json()).error, /Authentication required/i);
      });

      it("outside production (NODE_ENV=test), route handlers successfully accept test hooks", async () => {
        process.env.NODE_ENV = "test";

        const targetProjectId = new mongoose.Types.ObjectId().toString();

        const mockSession = {
          async withTransaction(fn) {
            return await fn();
          },
          async endSession() {},
        };

        mongoose.startSession = async () => mockSession;

        Project.findOneAndUpdate = async () => ({
          _id: targetProjectId,
          owner: testOwnerUser._id,
          isDeleting: false,
        });

        // 1. Task route handler honors _testInjectFailureStep outside production
        const taskReq = new Request(`http://localhost:3000/api/projects/${targetProjectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Failing Task In Test Environment" }),
        });
        taskReq._testSession = authorizedOwnerSession;
        taskReq._testForceTxSupport = true;
        taskReq._testInjectFailureStep = "afterParentLock"; // HONORED in test environment

        const taskRes = await createTask(taskReq, { params: { id: targetProjectId } });
        assert.equal(taskRes.status, 500);

        // 2. Milestone route handler honors _testInjectFailureStep outside production
        const msReq = new Request(
          `http://localhost:3000/api/projects/${targetProjectId}/milestones`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Failing Milestone In Test Environment" }),
          }
        );
        msReq._testSession = authorizedOwnerSession;
        msReq._testForceTxSupport = true;
        msReq._testInjectFailureStep = "afterParentLock"; // HONORED in test environment

        const msRes = await createMilestone(msReq, { params: { id: targetProjectId } });
        assert.equal(msRes.status, 500);
      });
    });
  });
});
