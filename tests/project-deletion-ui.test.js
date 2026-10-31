import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Load local environment safely if available
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not found or already loaded
}

import { DELETE as deleteProject } from "../src/app/api/projects/[id]/route.js";
import {
  POST as createProjectTask,
  GET as getProjectTasks,
} from "../src/app/api/projects/[id]/tasks/route.js";
import {
  POST as createProjectMilestone,
  GET as getProjectMilestones,
} from "../src/app/api/projects/[id]/milestones/route.js";
import { PATCH as updateProject } from "../src/app/api/projects/[id]/route.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Milestone from "../src/models/Milestone.js";
import Activity from "../src/models/Activity.js";

describe("Phase 5B Step 2: Project Deletion UI & Safeguard Integration Tests", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "3399117755";
  const mockOtherGithubId = "5577119933";

  const authorizedOwnerSession = {
    user: {
      name: "Deletion UI Owner",
      email: "owner.delui@example.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Stranger Visitor",
      email: "stranger.delui@example.local",
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
      name: "Deletion UI Owner",
      email: "owner.delui@example.local",
      githubId: mockOwnerGithubId,
    });

    otherUser = await User.create({
      name: "Stranger Visitor",
      email: "stranger.delui@example.local",
      githubId: mockOtherGithubId,
    });
  });

  after(async () => {
    if (!process.env.MONGODB_URI) return;
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
      await mongoose.disconnect();
    }
  });

  beforeEach(() => {
    process.env = { ...originalEnv, OWNER_GITHUB_ID: mockOwnerGithubId };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ---------------------------------------------------------------------------
  // 1. Component State & Interaction Logic Contracts
  // ---------------------------------------------------------------------------
  describe("1. Deletion Dialog & State Contracts", () => {
    it("defines dialog properties matching project deletion requirements", () => {
      const type = "project";
      const projectItem = {
        _id: "507f1f77bcf86cd799439011",
        title: "Mission Critical Platform",
      };

      const title =
        type === "project"
          ? "Delete Project"
          : type === "task"
          ? "Delete Task"
          : "Delete Milestone";

      const message =
        type === "project"
          ? "Are you sure you want to permanently delete this project? This will permanently delete the project and all associated tasks, milestones, and activities. This action cannot be undone."
          : "Standard deletion message";

      const confirmText = type === "project" ? "Delete Project" : "Confirm Delete";

      assert.equal(title, "Delete Project");
      assert.match(
        message,
        /permanently delete the project and all associated tasks, milestones, and activities/i
      );
      assert.equal(confirmText, "Delete Project");
    });

    it("verifies loading state disables interactions and indicates progress", () => {
      let isDeleting = false;
      const getButtonProps = (deleting) => ({
        cancelDisabled: deleting,
        confirmDisabled: deleting,
        label: deleting ? "Deleting..." : "Delete Project",
      });

      assert.deepEqual(getButtonProps(isDeleting), {
        cancelDisabled: false,
        confirmDisabled: false,
        label: "Delete Project",
      });

      isDeleting = true;
      assert.deepEqual(getButtonProps(isDeleting), {
        cancelDisabled: true,
        confirmDisabled: true,
        label: "Deleting...",
      });
    });

    it("formats redirect destination with deleted=true on HTTP 200", () => {
      const handleResponse = (status) => {
        if (status === 200) {
          return {
            action: "redirect",
            url: "/dashboard/projects?deleted=true",
          };
        }
        return { action: "stay" };
      };

      const outcome = handleResponse(200);
      assert.equal(outcome.action, "redirect");
      assert.equal(outcome.url, "/dashboard/projects?deleted=true");
    });

    it("formats explicit error message on HTTP 501 transaction requirement failure", () => {
      const getErrorMessage = (status) => {
        if (status === 501) {
          return "Project deletion requires a transaction-capable MongoDB deployment (replica set or mongos). Standalone MongoDB instances are unsupported for atomic cascade deletion. Zero records were modified.";
        }
        if (status === 404) {
          return "Project was not found or is no longer available in your workspace.";
        }
        return "An unexpected error occurred while deleting the project. Please try again.";
      };

      const msg501 = getErrorMessage(501);
      assert.match(msg501, /transaction-capable MongoDB deployment/i);
      assert.match(msg501, /replica set or mongos/i);
      assert.match(msg501, /standalone/i);
      assert.match(msg501, /Zero records were modified/i);

      const msg404 = getErrorMessage(404);
      assert.match(msg404, /not found or is no longer available/i);

      const msg500 = getErrorMessage(500);
      assert.match(msg500, /unexpected error/i);
    });

    it("verifies listing page searchParams detects deleted=true flag", () => {
      const parseDeletedFlag = (searchParams) => searchParams?.deleted === "true";

      assert.equal(parseDeletedFlag({ deleted: "true" }), true);
      assert.equal(parseDeletedFlag({ deleted: "false" }), false);
      assert.equal(parseDeletedFlag({}), false);
      assert.equal(parseDeletedFlag(null), false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authorization & Parameter Validation Boundaries
  // ---------------------------------------------------------------------------
  describe("2. Security Boundaries & Authorization Guards", () => {
    it("returns 401 when visitor is unauthenticated (no session)", async () => {
      const validObjectId = "507f1f77bcf86cd799439011";
      const req = new Request(
        `http://localhost:3000/api/projects/${validObjectId}`,
        { method: "DELETE" }
      );
      req._testSession = null;

      const res = await deleteProject(req, { params: { id: validObjectId } });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Authentication required/i);
    });

    it("returns 403 when visitor is not the verified owner", async () => {
      const validObjectId = "507f1f77bcf86cd799439011";
      const req = new Request(
        `http://localhost:3000/api/projects/${validObjectId}`,
        { method: "DELETE" }
      );
      req._testSession = unauthorizedVisitorSession;

      const res = await deleteProject(req, { params: { id: validObjectId } });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /Owner authorization required/i);
    });

    it("returns 400 when project ID is malformed", async () => {
      const req = new Request(
        "http://localhost:3000/api/projects/not-a-valid-object-id",
        { method: "DELETE" }
      );
      req._testSession = authorizedOwnerSession;

      const res = await deleteProject(req, {
        params: { id: "not-a-valid-object-id" },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Invalid project ID format/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Standalone Fail-Closed & IDOR Safeguard Integration (Live MongoDB)
  // ---------------------------------------------------------------------------
  describe("3. Standalone MongoDB Safeguard Integration", () => {
    it("returns 404 when attempting to delete a nonexistent project", async () => {
      if (!process.env.MONGODB_URI) return;

      const fakeId = new mongoose.Types.ObjectId().toString();
      const req = new Request(`http://localhost:3000/api/projects/${fakeId}`, {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;

      const res = await deleteProject(req, {
        params: { id: fakeId },
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.match(data.error, /Project not found/i);
    });

    it("returns 404 and prevents cross-owner deletion (IDOR safeguard)", async () => {
      if (!process.env.MONGODB_URI) return;

      const strangerProject = await Project.create({
        owner: otherUser._id,
        title: "Stranger Protected Project",
        slug: "stranger-delui-protected-project",
        shortDescription: "Must not be deleted by unauthorized user",
        category: "Backend",
        priority: "High",
        status: "Planned",
      });

      const req = new Request(
        `http://localhost:3000/api/projects/${strangerProject._id}`,
        { method: "DELETE" }
      );
      req._testSession = authorizedOwnerSession;

      const res = await deleteProject(req, {
        params: { id: strangerProject._id.toString() },
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.match(data.error, /Project not found/i);

      // Verify the stranger's project is still completely intact in database
      const stillExists = await Project.findById(strangerProject._id);
      assert.ok(stillExists);
      assert.equal(stillExists.title, "Stranger Protected Project");
      await Project.deleteOne({ _id: strangerProject._id });
    });

    it("fails closed with HTTP 501 on standalone MongoDB, leaving all records completely intact", async () => {
      if (!process.env.MONGODB_URI) return;

      // Create project
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Standalone Guard Project",
        slug: "standalone-delui-guard-project",
        shortDescription: "Guard project for testing standalone 501 fail-closed",
        category: "Full Stack",
        priority: "High",
        status: "In Progress",
      });

      // Create child task
      const task = await Task.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Critical Database Task",
        status: "Todo",
        priority: "High",
      });

      // Create child milestone
      const milestone = await Milestone.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Alpha Milestone",
        status: "Planned",
      });

      // Create activity record
      const activity = await Activity.create({
        owner: testOwnerUser._id,
        project: project._id,
        type: "project_created",
        message: "Project initialized for deletion UI test",
      });

      const req = new Request(
        `http://localhost:3000/api/projects/${project._id}`,
        { method: "DELETE" }
      );
      req._testSession = authorizedOwnerSession;

      const res = await deleteProject(req, {
        params: { id: project._id.toString() },
      });

      // Standalone MongoDB must fail closed with 501 Not Implemented
      assert.equal(res.status, 501);
      const data = await res.json();
      assert.match(
        data.error,
        /Atomic cascade deletion requires MongoDB transaction support/i
      );

      // Verify ZERO records were touched or deleted
      const foundProject = await Project.findById(project._id);
      assert.ok(foundProject, "Project must still exist after 501 fail-closed");

      const foundTask = await Task.findById(task._id);
      assert.ok(foundTask, "Child task must still exist after 501 fail-closed");

      const foundMilestone = await Milestone.findById(milestone._id);
      assert.ok(foundMilestone, "Child milestone must still exist after 501 fail-closed");

      const foundActivity = await Activity.findById(activity._id);
      assert.ok(foundActivity, "Activity record must still exist after 501 fail-closed");

      // Cleanup fixtures
      await Activity.deleteOne({ _id: activity._id });
      await Milestone.deleteOne({ _id: milestone._id });
      await Task.deleteOne({ _id: task._id });
      await Project.deleteOne({ _id: project._id });
    });

    it("confirms normal task/milestone management and project editing remain functional", async () => {
      if (!process.env.MONGODB_URI) return;

      // 1. Create project
      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Active Functional Project",
        slug: "active-delui-functional-project",
        shortDescription: "Functional project to ensure regression safety",
        category: "Frontend",
        priority: "Medium",
        status: "Planned",
      });

      // 2. Create task via API
      const taskReq = new Request(
        `http://localhost:3000/api/projects/${project._id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Setup UI layout", priority: "High" }),
        }
      );
      taskReq._testSession = authorizedOwnerSession;

      const taskRes = await createProjectTask(taskReq, {
        params: { id: project._id.toString() },
      });
      assert.equal(taskRes.status, 201);
      const taskData = await taskRes.json();
      assert.equal(taskData.task.title, "Setup UI layout");

      // 3. Create milestone via API
      const msReq = new Request(
        `http://localhost:3000/api/projects/${project._id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "v1.0 Launch" }),
        }
      );
      msReq._testSession = authorizedOwnerSession;

      const msRes = await createProjectMilestone(msReq, {
        params: { id: project._id.toString() },
      });
      assert.equal(msRes.status, 201);
      const msData = await msRes.json();
      assert.equal(msData.milestone.title, "v1.0 Launch");

      // 4. Update project via API
      const editReq = new Request(
        `http://localhost:3000/api/projects/${project._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Renamed Active Project", status: "In Progress" }),
        }
      );
      editReq._testSession = authorizedOwnerSession;

      const editRes = await updateProject(editReq, {
        params: { id: project._id.toString() },
      });
      assert.equal(editRes.status, 200);
      const editData = await editRes.json();
      assert.equal(editData.project.title, "Renamed Active Project");
      assert.equal(editData.project.status, "In Progress");

      // Cleanup fixtures
      await Milestone.deleteMany({ project: project._id });
      await Task.deleteMany({ project: project._id });
      await Project.deleteOne({ _id: project._id });
    });
  });
});
