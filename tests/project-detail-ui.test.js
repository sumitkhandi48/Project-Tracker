import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Load local environment safely if available
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not found or already loaded
}

import { getProjectDetails } from "../src/lib/api/project-service.js";
import {
  calculateProjectProgress,
  calculateMilestoneStats,
} from "../src/lib/utils/project-progress.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Milestone from "../src/models/Milestone.js";

import {
  GET as getProjectTasks,
  POST as createProjectTask,
} from "../src/app/api/projects/[id]/tasks/route.js";
import {
  PATCH as updateTask,
  DELETE as deleteTask,
} from "../src/app/api/tasks/[id]/route.js";
import {
  GET as getProjectMilestones,
  POST as createProjectMilestone,
} from "../src/app/api/projects/[id]/milestones/route.js";
import {
  PATCH as updateMilestone,
  DELETE as deleteMilestone,
} from "../src/app/api/milestones/[id]/route.js";

describe("Phase 5A Step 3: Project Detail & Task/Milestone Management Tests", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "5544332211";
  const mockOtherGithubId = "1100229988";

  const authorizedOwnerSession = {
    user: {
      name: "Detail Owner",
      email: "owner.detail@example.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Stranger Visitor",
      email: "stranger.detail@example.local",
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
    await User.init();

    // Clean existing test fixtures
    await User.deleteMany({
      githubId: { $in: [mockOwnerGithubId, mockOtherGithubId] },
    });

    testOwnerUser = await User.create({
      name: "Detail Owner",
      email: "owner.detail@example.local",
      githubId: mockOwnerGithubId,
    });

    otherUser = await User.create({
      name: "Stranger User",
      email: "stranger.detail@example.local",
      githubId: mockOtherGithubId,
    });
  });

  after(async () => {
    if (!process.env.MONGODB_URI) return;
    try {
      if (testOwnerUser?._id) {
        await Milestone.deleteMany({ owner: testOwnerUser._id });
        await Task.deleteMany({ owner: testOwnerUser._id });
        await Project.deleteMany({ owner: testOwnerUser._id });
        await User.deleteOne({ _id: testOwnerUser._id });
      }
      if (otherUser?._id) {
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

  // =========================================================================
  // 1. Progress Calculation & Statistics Engine (Offline / Unit Tests)
  // =========================================================================
  describe("1. Progress Calculation & Statistics Logic (Unit Tests)", () => {
    it("returns manual progress fallback when tasks array is empty or undefined", () => {
      const statsNoTasks = calculateProjectProgress([], 45);
      assert.equal(statsNoTasks.progress, 45);
      assert.equal(statsNoTasks.progressSource, "manual");
      assert.equal(statsNoTasks.taskCounts.total, 0);
      assert.equal(statsNoTasks.taskCounts.completed, 0);

      const statsUndefined = calculateProjectProgress(null, 70);
      assert.equal(statsUndefined.progress, 70);
      assert.equal(statsUndefined.progressSource, "manual");
    });

    it("clamps manual progress to [0, 100] boundaries", () => {
      assert.equal(calculateProjectProgress([], -10).progress, 0);
      assert.equal(calculateProjectProgress([], 150).progress, 100);
      assert.equal(calculateProjectProgress([], NaN).progress, 0);
    });

    it("calculates dynamic progress correctly from tasks (completed / total)", () => {
      const tasks = [
        { status: "Done" },
        { status: "Done" },
        { status: "In Progress" },
        { status: "Todo" },
      ];
      const stats = calculateProjectProgress(tasks, 0);
      assert.equal(stats.progress, 50); // 2/4 = 50%
      assert.equal(stats.progressSource, "tasks");
      assert.equal(stats.taskCounts.total, 4);
      assert.equal(stats.taskCounts.completed, 2);
      assert.equal(stats.taskCounts.inProgress, 1);
      assert.equal(stats.taskCounts.todo, 1);
    });

    it("calculates 100% progress when all tasks are Done", () => {
      const tasks = [{ status: "Done" }, { status: "Done" }];
      const stats = calculateProjectProgress(tasks, 10);
      assert.equal(stats.progress, 100);
      assert.equal(stats.progressSource, "tasks");
    });

    it("calculates 0% progress when no tasks are Done", () => {
      const tasks = [{ status: "Todo" }, { status: "In Progress" }];
      const stats = calculateProjectProgress(tasks, 80);
      assert.equal(stats.progress, 0);
      assert.equal(stats.progressSource, "tasks");
    });

    it("calculates milestone statistics accurately", () => {
      const milestones = [
        { status: "Planned" },
        { status: "In Progress" },
        { status: "Completed" },
        { status: "Completed" },
      ];
      const stats = calculateMilestoneStats(milestones);
      assert.equal(stats.total, 4);
      assert.equal(stats.completed, 2);
      assert.equal(stats.inProgress, 1);
      assert.equal(stats.planned, 1);

      assert.deepEqual(calculateMilestoneStats([]), {
        total: 0,
        completed: 0,
        inProgress: 0,
        planned: 0,
      });
    });
  });

  // =========================================================================
  // 2. Authorization Boundaries for Child APIs (Offline / Unit Tests)
  // =========================================================================
  describe("2. Authorization & Input Boundaries (Offline / Unit Tests)", () => {
    it("returns 401 when visitor is unauthenticated on GET /api/projects/[id]/tasks", async () => {
      const req = new Request("http://localhost:3000/api/projects/666666666666666666666666/tasks");
      const res = await getProjectTasks(req, {
        params: Promise.resolve({ id: "666666666666666666666666" }),
      });
      assert.equal(res.status, 401);
    });

    it("returns 403 when authenticated as a non-owner on POST /api/projects/[id]/tasks", async () => {
      const req = new Request("http://localhost:3000/api/projects/666666666666666666666666/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Infiltrate" }),
      });
      req._testSession = unauthorizedVisitorSession;
      const res = await createProjectTask(req, {
        params: Promise.resolve({ id: "666666666666666666666666" }),
      });
      assert.equal(res.status, 403);
    });

    it("returns 400 when project ID route parameter is invalid ObjectId format", async () => {
      const req = new Request("http://localhost:3000/api/projects/invalid-id/tasks");
      req._testSession = authorizedOwnerSession;
      const res = await getProjectTasks(req, {
        params: Promise.resolve({ id: "invalid-id" }),
      });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /Invalid project ID format/i);
    });

    it("returns 401 on PATCH /api/tasks/[id] when visitor is unauthenticated", async () => {
      const req = new Request("http://localhost:3000/api/tasks/666666666666666666666666", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      const res = await updateTask(req, {
        params: Promise.resolve({ id: "666666666666666666666666" }),
      });
      assert.equal(res.status, 401);
    });

    it("returns 403 on DELETE /api/tasks/[id] when visitor is non-owner", async () => {
      const req = new Request("http://localhost:3000/api/tasks/666666666666666666666666", {
        method: "DELETE",
      });
      req._testSession = unauthorizedVisitorSession;
      const res = await deleteTask(req, {
        params: Promise.resolve({ id: "666666666666666666666666" }),
      });
      assert.equal(res.status, 403);
    });

    it("returns 401 on POST /api/projects/[id]/milestones when unauthenticated", async () => {
      const req = new Request(
        "http://localhost:3000/api/projects/666666666666666666666666/milestones",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "M1" }),
        }
      );
      const res = await createProjectMilestone(req, {
        params: Promise.resolve({ id: "666666666666666666666666" }),
      });
      assert.equal(res.status, 401);
    });
  });

  // =========================================================================
  // 3. Project Detail Service & Live MongoDB Integration
  // =========================================================================
  describe("3. Project Detail Service & CRUD Management (Live MongoDB)", () => {
    let testProject;
    let otherUserProject;

    beforeEach(async () => {
      if (!process.env.MONGODB_URI) return;
      await Milestone.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Task.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Project.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });

      testProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Platform Core V2",
        slug: "platform-core-v2",
        shortDescription: "Centralized backend engine",
        description: "Extended architecture details for Platform Core V2",
        category: "Infrastructure",
        priority: "High",
        status: "In Progress",
        visibility: "Private",
        techStack: ["Node.js", "MongoDB", "Redis"],
        tags: ["backend", "core"],
        repositoryUrl: "https://github.com/owner/platform-core",
        liveUrl: "https://platform-core.dev",
        notes: "Remember to run migrations before testing",
        progress: 25,
      });

      otherUserProject = await Project.create({
        owner: otherUser._id,
        title: "Stranger Hidden Project",
        slug: "stranger-hidden",
        shortDescription: "Must remain completely inaccessible to testOwnerUser",
        status: "In Progress",
      });
    });

    it("returns null for malformed or non-existent project IDs in getProjectDetails", async () => {
      if (!process.env.MONGODB_URI) return;

      const malformedResult = await getProjectDetails({
        projectId: "not-an-id",
        ownerId: testOwnerUser._id,
      });
      assert.equal(malformedResult, null);

      const nonExistentResult = await getProjectDetails({
        projectId: new mongoose.Types.ObjectId(),
        ownerId: testOwnerUser._id,
      });
      assert.equal(nonExistentResult, null);
    });

    it("enforces tenant isolation: returns null when requesting another user's project", async () => {
      if (!process.env.MONGODB_URI) return;

      const idorResult = await getProjectDetails({
        projectId: otherUserProject._id,
        ownerId: testOwnerUser._id,
      });
      assert.equal(idorResult, null);
    });

    it("retrieves project details, tasks, milestones, and calculates dynamic progress", async () => {
      if (!process.env.MONGODB_URI) return;

      // Seed 2 tasks (1 Done, 1 In Progress)
      await Task.create([
        {
          owner: testOwnerUser._id,
          project: testProject._id,
          title: "Build auth module",
          status: "Done",
          priority: "Critical",
        },
        {
          owner: testOwnerUser._id,
          project: testProject._id,
          title: "Setup CI/CD pipeline",
          status: "In Progress",
          priority: "High",
        },
      ]);

      // Seed 1 milestone
      await Milestone.create({
        owner: testOwnerUser._id,
        project: testProject._id,
        title: "Alpha Milestone",
        status: "Planned",
      });

      const details = await getProjectDetails({
        projectId: testProject._id,
        ownerId: testOwnerUser._id,
      });

      assert.ok(details);
      assert.ok(details.project);
      assert.equal(details.project.title, "Platform Core V2");
      assert.equal(details.project.slug, "platform-core-v2");
      assert.equal(details.project.progress, 50); // 1 of 2 tasks Done = 50%
      assert.equal(details.project.progressSource, "tasks");

      assert.equal(details.tasks.length, 2);
      assert.equal(details.milestones.length, 1);
      assert.equal(details.stats.taskCounts.total, 2);
      assert.equal(details.stats.taskCounts.completed, 1);
      assert.equal(details.stats.milestoneCounts.total, 1);
      assert.equal(details.stats.milestoneCounts.planned, 1);
    });

    it("creates a task and updates progress dynamically via Task API", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${testProject._id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Write documentation",
            description: "Markdown docs for Phase 5A",
            priority: "Medium",
            status: "Todo",
          }),
        }
      );
      req._testSession = authorizedOwnerSession;

      const res = await createProjectTask(req, {
        params: Promise.resolve({ id: testProject._id.toString() }),
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.task);
      assert.equal(data.task.title, "Write documentation");
      assert.equal(data.task.project, testProject._id.toString());
      assert.equal(data.task.owner, testOwnerUser._id.toString());
    });

    it("toggles task status to 'Done' and auto-populates completedAt via PATCH", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.create({
        owner: testOwnerUser._id,
        project: testProject._id,
        title: "Configurable logging",
        status: "In Progress",
      });

      const req = new Request(`http://localhost:3000/api/tasks/${task._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      req._testSession = authorizedOwnerSession;

      const res = await updateTask(req, {
        params: Promise.resolve({ id: task._id.toString() }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.task.status, "Done");
      assert.ok(data.task.completedAt); // auto-populated
    });

    it("reopens task from 'Done' to 'In Progress' and clears completedAt via PATCH", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.create({
        owner: testOwnerUser._id,
        project: testProject._id,
        title: "Completed Task to Reopen",
        status: "Done",
        completedAt: new Date(),
      });

      const req = new Request(`http://localhost:3000/api/tasks/${task._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "In Progress" }),
      });
      req._testSession = authorizedOwnerSession;

      const res = await updateTask(req, {
        params: Promise.resolve({ id: task._id.toString() }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.task.status, "In Progress");
      assert.equal(data.task.completedAt, null); // cleared
    });

    it("deletes a task successfully via DELETE /api/tasks/[id]", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.create({
        owner: testOwnerUser._id,
        project: testProject._id,
        title: "Temporary Task To Delete",
        status: "Todo",
      });

      const req = new Request(`http://localhost:3000/api/tasks/${task._id}`, {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;

      const res = await deleteTask(req, {
        params: Promise.resolve({ id: task._id.toString() }),
      });
      assert.equal(res.status, 200);

      const exists = await Task.findById(task._id);
      assert.equal(exists, null);
    });

    it("creates a milestone and auto-populates completedAt when Completed", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${testProject._id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "MVP Release v1.0",
            status: "Completed",
          }),
        }
      );
      req._testSession = authorizedOwnerSession;

      const res = await createProjectMilestone(req, {
        params: Promise.resolve({ id: testProject._id.toString() }),
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.milestone);
      assert.equal(data.milestone.title, "MVP Release v1.0");
      assert.equal(data.milestone.status, "Completed");
      assert.ok(data.milestone.completedAt);
    });

    it("deletes a milestone successfully via DELETE /api/milestones/[id]", async () => {
      if (!process.env.MONGODB_URI) return;

      const milestone = await Milestone.create({
        owner: testOwnerUser._id,
        project: testProject._id,
        title: "Temp Milestone to Delete",
        status: "Planned",
      });

      const req = new Request(`http://localhost:3000/api/milestones/${milestone._id}`, {
        method: "DELETE",
      });
      req._testSession = authorizedOwnerSession;

      const res = await deleteMilestone(req, {
        params: Promise.resolve({ id: milestone._id.toString() }),
      });
      assert.equal(res.status, 200);

      const exists = await Milestone.findById(milestone._id);
      assert.equal(exists, null);
    });
  });
});
