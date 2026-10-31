import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Load local environment safely if available
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not found or already loaded
}

import { GET as getDashboard } from "../src/app/api/dashboard/route.js";
import { getDashboardSummary } from "../src/lib/api/dashboard-service.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Milestone from "../src/models/Milestone.js";
import Activity from "../src/models/Activity.js";

describe("Phase 5A Step 1: Dashboard API & Summary Metrics Tests", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "8899001122";
  const mockOtherGithubId = "2211009988";

  const authorizedOwnerSession = {
    user: {
      name: "Dashboard Owner",
      email: "owner.dashboard@example.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Non-Owner Visitor",
      email: "visitor.dashboard@example.local",
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
      name: "Dashboard Owner",
      email: "owner.dashboard@example.local",
      githubId: mockOwnerGithubId,
    });

    otherUser = await User.create({
      name: "Other User",
      email: "other.dashboard@example.local",
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
  // 1. Authorization Boundaries (Offline / Unit Tests)
  // =========================================================================
  describe("1. Authorization Boundaries (Offline / Unit Tests)", () => {
    it("returns 401 when visitor is unauthenticated (no session)", async () => {
      const req = new Request("http://localhost:3000/api/dashboard", {
        method: "GET",
      });
      const res = await getDashboard(req);
      assert.equal(res.status, 401);
      assert.match((await res.json()).error, /Authentication required/i);
    });

    it("returns 403 when authenticated as a non-owner visitor", async () => {
      const req = new Request("http://localhost:3000/api/dashboard", {
        method: "GET",
      });
      req._testSession = unauthorizedVisitorSession;
      const res = await getDashboard(req);
      assert.equal(res.status, 403);
      assert.match((await res.json()).error, /Owner authorization required/i);
    });
  });

  // =========================================================================
  // 2. Dashboard Summary Calculations & Owner Scoping (Genuine Integration Tests)
  // =========================================================================
  describe("2. Dashboard Summary Calculations & Owner Scoping (Live MongoDB Integration Tests)", () => {
    beforeEach(async () => {
      if (!process.env.MONGODB_URI) return;
      await Task.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Milestone.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Activity.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Project.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
    });

    it("returns honest empty workspace statistics when owner has zero records", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request("http://localhost:3000/api/dashboard", { method: "GET" });
      req._testSession = authorizedOwnerSession;

      const res = await getDashboard(req);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.stats.projects.total, 0);
      assert.equal(data.stats.projects.byStatus["Planned"], 0);
      assert.equal(data.stats.projects.byStatus["In Progress"], 0);
      assert.equal(data.stats.projects.byStatus["On Hold"], 0);
      assert.equal(data.stats.projects.byStatus["Completed"], 0);

      assert.equal(data.stats.tasks.total, 0);
      assert.equal(data.stats.tasks.completed, 0);
      assert.equal(data.stats.tasks.outstanding, 0);
      assert.equal(data.stats.tasks.overdue, 0);
      assert.equal(data.stats.tasks.completionRate, 0);

      assert.equal(data.stats.milestones.total, 0);
      assert.equal(data.stats.milestones.completed, 0);
      assert.equal(data.stats.milestones.outstanding, 0);
      assert.equal(data.stats.milestones.overdue, 0);
      assert.equal(data.stats.milestones.completionRate, 0);

      assert.deepEqual(data.recentProjects, []);
      assert.deepEqual(data.upcomingTasks, []);
      assert.deepEqual(data.overdueTasks, []);
      assert.deepEqual(data.upcomingMilestones, []);
      assert.deepEqual(data.overdueMilestones, []);
      assert.deepEqual(data.recentActivities, []);
    });

    it("enforces strict owner scoping: ignores other users' projects, tasks, and activities", async () => {
      if (!process.env.MONGODB_URI) return;

      // Seed data strictly for otherUser
      const otherProject = await Project.create({
        owner: otherUser._id,
        title: "Other User Secret Project",
        slug: "other-user-secret-project",
        shortDescription: "Must never appear in testOwner's dashboard",
        status: "In Progress",
      });

      await Task.create({
        owner: otherUser._id,
        project: otherProject._id,
        title: "Other User Task",
        status: "Done",
      });

      await Milestone.create({
        owner: otherUser._id,
        project: otherProject._id,
        title: "Other User Milestone",
        status: "Completed",
      });

      await Activity.create({
        owner: otherUser._id,
        project: otherProject._id,
        type: "project_created",
        message: "Other user activity",
      });

      // Request dashboard as authorizedOwner
      const req = new Request("http://localhost:3000/api/dashboard", { method: "GET" });
      req._testSession = authorizedOwnerSession;

      const res = await getDashboard(req);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.stats.projects.total, 0);
      assert.equal(data.stats.tasks.total, 0);
      assert.equal(data.stats.milestones.total, 0);
      assert.deepEqual(data.recentProjects, []);
      assert.deepEqual(data.recentActivities, []);
    });

    it("calculates project progress dynamically from tasks when tasks exist, and falls back to manual progress when 0 tasks", async () => {
      if (!process.env.MONGODB_URI) return;

      // Project A: Has 4 tasks (3 Done, 1 In Progress) -> calculated progress = 75%
      const projectA = await Project.create({
        owner: testOwnerUser._id,
        title: "Task-Driven Project",
        slug: "task-driven-project",
        shortDescription: "Progress calculated from tasks",
        status: "In Progress",
        progress: 10, // Manual progress should be ignored because tasks exist
      });

      await Task.create([
        { owner: testOwnerUser._id, project: projectA._id, title: "Task 1", status: "Done" },
        { owner: testOwnerUser._id, project: projectA._id, title: "Task 2", status: "Done" },
        { owner: testOwnerUser._id, project: projectA._id, title: "Task 3", status: "Done" },
        { owner: testOwnerUser._id, project: projectA._id, title: "Task 4", status: "In Progress" },
      ]);

      // Project B: Has 0 tasks -> uses manual progress = 45%
      const projectB = await Project.create({
        owner: testOwnerUser._id,
        title: "Manual Progress Project",
        slug: "manual-progress-project",
        shortDescription: "Progress uses manual value",
        status: "Planned",
        progress: 45,
      });

      const summary = await getDashboardSummary(testOwnerUser._id);

      assert.equal(summary.stats.projects.total, 2);
      assert.equal(summary.stats.tasks.total, 4);
      assert.equal(summary.stats.tasks.completed, 3);
      assert.equal(summary.stats.tasks.outstanding, 1);
      assert.equal(summary.stats.tasks.completionRate, 75);

      const projASummary = summary.recentProjects.find((p) => p._id === projectA._id.toString());
      assert.ok(projASummary);
      assert.equal(projASummary.progress, 75);
      assert.equal(projASummary.progressSource, "tasks");
      assert.equal(projASummary.taskCounts.total, 4);
      assert.equal(projASummary.taskCounts.completed, 3);

      const projBSummary = summary.recentProjects.find((p) => p._id === projectB._id.toString());
      assert.ok(projBSummary);
      assert.equal(projBSummary.progress, 45);
      assert.equal(projBSummary.progressSource, "manual");
      assert.equal(projBSummary.taskCounts.total, 0);
    });

    it("identifies upcoming and overdue tasks and milestones accurately", async () => {
      if (!process.env.MONGODB_URI) return;

      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Deadlines Project",
        slug: "deadlines-project",
        shortDescription: "Testing schedule categorization",
      });

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // 1. Overdue task (Todo + past due date)
      await Task.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Overdue Todo Task",
        status: "Todo",
        dueDate: yesterday,
      });

      // 2. Upcoming task (In Progress + future due date)
      await Task.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Upcoming Active Task",
        status: "In Progress",
        dueDate: nextWeek,
      });

      // 3. Completed task with past date -> MUST NOT be in overdue
      await Task.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Completed Past Task",
        status: "Done",
        dueDate: yesterday,
      });

      // 4. Overdue milestone (Planned + past target date)
      await Milestone.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Overdue Milestone",
        status: "Planned",
        targetDate: yesterday,
      });

      // 5. Upcoming milestone (In Progress + future target date)
      await Milestone.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Upcoming Milestone",
        status: "In Progress",
        targetDate: nextWeek,
      });

      // 6. Completed milestone with past date -> MUST NOT be in overdue
      await Milestone.create({
        owner: testOwnerUser._id,
        project: project._id,
        title: "Completed Past Milestone",
        status: "Completed",
        targetDate: yesterday,
      });

      const summary = await getDashboardSummary(testOwnerUser._id);

      assert.equal(summary.stats.tasks.overdue, 1);
      assert.equal(summary.stats.milestones.overdue, 1);

      assert.equal(summary.overdueTasks.length, 1);
      assert.equal(summary.overdueTasks[0].title, "Overdue Todo Task");
      assert.equal(summary.overdueTasks[0].project.title, "Deadlines Project");

      assert.equal(summary.upcomingTasks.length, 1);
      assert.equal(summary.upcomingTasks[0].title, "Upcoming Active Task");

      assert.equal(summary.overdueMilestones.length, 1);
      assert.equal(summary.overdueMilestones[0].title, "Overdue Milestone");

      assert.equal(summary.upcomingMilestones.length, 1);
      assert.equal(summary.upcomingMilestones[0].title, "Upcoming Milestone");
    });

    it("retrieves recent activities with project population in chronological order", async () => {
      if (!process.env.MONGODB_URI) return;

      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Activity Project",
        slug: "activity-project",
        shortDescription: "Testing activity log",
      });

      await Activity.create({
        owner: testOwnerUser._id,
        project: project._id,
        type: "project_created",
        message: "Created initial activity project",
        createdAt: new Date(Date.now() - 5000),
      });

      await Activity.create({
        owner: testOwnerUser._id,
        project: project._id,
        type: "task_created",
        message: "Added task to activity project",
        createdAt: new Date(),
      });

      const summary = await getDashboardSummary(testOwnerUser._id);

      assert.equal(summary.recentActivities.length, 2);
      assert.equal(summary.recentActivities[0].message, "Added task to activity project");
      assert.equal(summary.recentActivities[0].project.title, "Activity Project");
      assert.equal(summary.recentActivities[1].message, "Created initial activity project");
    });

    it("limits recent projects to at most 5 projects ordered by updatedAt desc", async () => {
      if (!process.env.MONGODB_URI) return;

      for (let i = 1; i <= 7; i++) {
        await Project.create({
          owner: testOwnerUser._id,
          title: `Project ${i}`,
          slug: `project-${i}`,
          shortDescription: `Description for project ${i}`,
        });
      }

      const summary = await getDashboardSummary(testOwnerUser._id);
      assert.equal(summary.stats.projects.total, 7);
      assert.equal(summary.recentProjects.length, 5, "Must limit recentProjects to at most 5");
      // Most recently created (Project 7) should be first
      assert.equal(summary.recentProjects[0].title, "Project 7");
    });

    it("returns safe 500 JSON without leaking stack traces on unexpected database failure", async () => {
      if (!process.env.MONGODB_URI) return;

      const originalCountDocuments = Project.countDocuments;
      try {
        Project.countDocuments = async () => {
          throw new Error("Simulated low-level driver failure: connection reset by peer");
        };

        const req = new Request("http://localhost:3000/api/dashboard", { method: "GET" });
        req._testSession = authorizedOwnerSession;

        const res = await getDashboard(req);
        assert.equal(res.status, 500);

        const data = await res.json();
        assert.equal(
          data.error,
          "An unexpected error occurred while retrieving dashboard data"
        );
        assert.equal(data.stack, undefined);
      } finally {
        Project.countDocuments = originalCountDocuments;
      }
    });
  });
});
