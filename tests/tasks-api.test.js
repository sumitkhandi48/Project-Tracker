import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Load local environment safely if available
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not found or already loaded
}

import {
  GET as getProjectTasks,
  POST as createProjectTask,
} from "../src/app/api/projects/[id]/tasks/route.js";
import {
  GET as getTaskById,
  PATCH as updateTaskById,
  DELETE as deleteTaskById,
} from "../src/app/api/tasks/[id]/route.js";

import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";

describe("Phase 4B Task API Test Suite", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "9988776655";
  const mockOtherGithubId = "1122334455";

  // Mock sessions for route handler unit testing
  const authorizedOwnerSession = {
    user: {
      name: "Verified Owner",
      email: "owner@project-tracker.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Non-Owner Visitor",
      email: "visitor@project-tracker.local",
      githubId: mockOtherGithubId,
    },
  };

  beforeEach(() => {
    process.env = { ...originalEnv, OWNER_GITHUB_ID: mockOwnerGithubId };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. Task API Request Validation & Security Boundaries (Offline / Unit Tests)
  // =========================================================================
  describe("Task API Request Validation & Security Boundaries (Offline / Unit Tests)", () => {
    const validObjectId = "507f1f77bcf86cd799439011";

    // -----------------------------------------------------------------------
    // Authentication & Authorization Barriers
    // -----------------------------------------------------------------------
    it("returns 401 when visitor is unauthenticated (no session)", async () => {
      // Project-scoped routes
      const getReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`);
      const getRes = await getProjectTasks(getReq, { params: { id: validObjectId } });
      assert.equal(getRes.status, 401);

      const postReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Task 1" }),
      });
      const postRes = await createProjectTask(postReq, { params: { id: validObjectId } });
      assert.equal(postRes.status, 401);

      // Single-task routes
      const getSingleReq = new Request(`http://localhost:3000/api/tasks/${validObjectId}`);
      const getSingleRes = await getTaskById(getSingleReq, { params: { id: validObjectId } });
      assert.equal(getSingleRes.status, 401);

      const patchReq = new Request(`http://localhost:3000/api/tasks/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      const patchRes = await updateTaskById(patchReq, { params: { id: validObjectId } });
      assert.equal(patchRes.status, 401);

      const deleteReq = new Request(`http://localhost:3000/api/tasks/${validObjectId}`, {
        method: "DELETE",
      });
      const deleteRes = await deleteTaskById(deleteReq, { params: { id: validObjectId } });
      assert.equal(deleteRes.status, 401);
    });

    it("returns 403 when authenticated as a non-owner visitor", async () => {
      const getReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`);
      getReq._testSession = unauthorizedVisitorSession;
      const getRes = await getProjectTasks(getReq, { params: { id: validObjectId } });
      assert.equal(getRes.status, 403);
      const data = await getRes.json();
      assert.match(data.error, /Owner authorization required/i);

      const postReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Task" }),
      });
      postReq._testSession = unauthorizedVisitorSession;
      const postRes = await createProjectTask(postReq, { params: { id: validObjectId } });
      assert.equal(postRes.status, 403);

      const patchReq = new Request(`http://localhost:3000/api/tasks/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      patchReq._testSession = unauthorizedVisitorSession;
      const patchRes = await updateTaskById(patchReq, { params: { id: validObjectId } });
      assert.equal(patchRes.status, 403);
    });

    // -----------------------------------------------------------------------
    // ID Validation
    // -----------------------------------------------------------------------
    it("returns 400 for malformed project and task IDs", async () => {
      const invalidId = "invalid-not-an-object-id";

      const getReq = new Request(`http://localhost:3000/api/projects/${invalidId}/tasks`);
      getReq._testSession = authorizedOwnerSession;
      const getRes = await getProjectTasks(getReq, { params: { id: invalidId } });
      assert.equal(getRes.status, 400);
      assert.match((await getRes.json()).error, /Invalid project ID format/i);

      const postReq = new Request(`http://localhost:3000/api/projects/${invalidId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Task" }),
      });
      postReq._testSession = authorizedOwnerSession;
      const postRes = await createProjectTask(postReq, { params: { id: invalidId } });
      assert.equal(postRes.status, 400);

      const singleGetReq = new Request(`http://localhost:3000/api/tasks/${invalidId}`);
      singleGetReq._testSession = authorizedOwnerSession;
      const singleGetRes = await getTaskById(singleGetReq, { params: { id: invalidId } });
      assert.equal(singleGetRes.status, 400);
      assert.match((await singleGetRes.json()).error, /Invalid task ID format/i);

      const deleteReq = new Request(`http://localhost:3000/api/tasks/${invalidId}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;
      const deleteRes = await deleteTaskById(deleteReq, { params: { id: invalidId } });
      assert.equal(deleteRes.status, 400);
    });

    // -----------------------------------------------------------------------
    // Content-Type & JSON Parsing Enforcement
    // -----------------------------------------------------------------------
    it("returns 415 when Content-Type is missing or not application/json", async () => {
      const reqNoHeader = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: "Task" }),
      });
      reqNoHeader._testSession = authorizedOwnerSession;
      const resNoHeader = await createProjectTask(reqNoHeader, { params: { id: validObjectId } });
      assert.equal(resNoHeader.status, 415);
      assert.match((await resNoHeader.json()).error, /Content-Type must be application\/json/i);

      const reqTextPlain = new Request(`http://localhost:3000/api/tasks/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ status: "Done" }),
      });
      reqTextPlain._testSession = authorizedOwnerSession;
      const resTextPlain = await updateTaskById(reqTextPlain, { params: { id: validObjectId } });
      assert.equal(resTextPlain.status, 415);
    });

    it("returns 400 when request body contains malformed JSON", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json: true, ",
      });
      req._testSession = authorizedOwnerSession;
      const res = await createProjectTask(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /Malformed JSON/i);
    });

    // -----------------------------------------------------------------------
    // Payload Validation (Protected Fields, Enums, Types)
    // -----------------------------------------------------------------------
    it("returns 400 when client attempts mass assignment on protected fields (owner, project, _id)", async () => {
      const protectedFields = ["owner", "project", "_id", "createdAt", "updatedAt", "__v"];
      for (const field of protectedFields) {
        const req = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Task with protected field",
            [field]: "malicious_override",
          }),
        });
        req._testSession = authorizedOwnerSession;
        const res = await createProjectTask(req, { params: { id: validObjectId } });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.ok(
          data.errors.some((e) => e.includes(`Modifying protected field '${field}'`)),
          `Expected error for protected field '${field}'`
        );
      }
    });

    it("returns 400 when client supplies unsupported arbitrary fields", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Legit Task",
          unsupportedProp: "value",
        }),
      });
      req._testSession = authorizedOwnerSession;
      const res = await createProjectTask(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.errors.some((e) => e.includes("Unsupported field 'unsupportedProp'")));
    });

    it("returns 400 when PATCH body has no valid mutable fields", async () => {
      const req = new Request(`http://localhost:3000/api/tasks/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      req._testSession = authorizedOwnerSession;
      const res = await updateTaskById(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /No valid fields provided for update/i);
    });

    it("returns 400 when invalid status or priority enum is provided", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task with invalid status",
          status: "ArchivedStatus",
          priority: "UrgentPriority",
        }),
      });
      req._testSession = authorizedOwnerSession;
      const res = await createProjectTask(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.errors.some((e) => e.includes("Status must be one of")));
      assert.ok(data.errors.some((e) => e.includes("Priority must be one of")));
    });

    it("returns 400 when invalid date format is provided", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${validObjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task with bad date",
          dueDate: "not-a-valid-date-string",
        }),
      });
      req._testSession = authorizedOwnerSession;
      const res = await createProjectTask(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.errors.some((e) => /must be a valid date/i.test(e)));
    });
  });

  // =========================================================================
  // 2. Task API End-to-End Integration & Multi-Tenant Isolation (Live MongoDB)
  // =========================================================================
  describe("Task API End-to-End Integration & Multi-Tenant Isolation (Live MongoDB)", () => {
    let testOwnerUser;
    let otherUser;
    let ownerProject;
    let otherProject;

    before(async () => {
      if (!process.env.MONGODB_URI) return;

      await connectToDatabase();
      await Task.init();
      await Project.init();
      await User.init();

      // Clean existing fixtures for these test IDs
      await User.deleteMany({
        githubId: { $in: [mockOwnerGithubId, mockOtherGithubId] },
      });

      testOwnerUser = await User.create({
        name: "Test Owner",
        email: "owner.tasktest@example.com",
        githubId: mockOwnerGithubId,
      });

      otherUser = await User.create({
        name: "Other User",
        email: "other.tasktest@example.com",
        githubId: mockOtherGithubId,
      });

      ownerProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Owner Task Project",
        slug: "owner-task-project",
        shortDescription: "Project for testing tasks API",
      });

      otherProject = await Project.create({
        owner: otherUser._id,
        title: "Other User Task Project",
        slug: "other-user-task-project",
        shortDescription: "Other user's project for testing isolation",
      });
    });

    after(async () => {
      if (!process.env.MONGODB_URI) return;
      try {
        if (testOwnerUser?._id) {
          await Task.deleteMany({ owner: testOwnerUser._id });
          await Project.deleteMany({ owner: testOwnerUser._id });
          await User.deleteOne({ _id: testOwnerUser._id });
        }
        if (otherUser?._id) {
          await Task.deleteMany({ owner: otherUser._id });
          await Project.deleteMany({ owner: otherUser._id });
          await User.deleteOne({ _id: otherUser._id });
        }
      } finally {
        await mongoose.disconnect();
      }
    });

    // -----------------------------------------------------------------------
    // Parent Project Ownership & IDOR Protection
    // -----------------------------------------------------------------------
    it("returns 404 when attempting to create a task in a non-existent project", async () => {
      if (!process.env.MONGODB_URI) return;

      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const req = new Request(`http://localhost:3000/api/projects/${nonExistentId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Orphan Task" }),
      });
      req._testSession = authorizedOwnerSession;
      const res = await createProjectTask(req, { params: { id: nonExistentId } });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);
    });

    it("returns 404 when attempting to create a task in another owner's project (IDOR prevention)", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${otherProject._id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Injected Task" }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectTask(req, {
        params: { id: otherProject._id.toString() },
      });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);
    });

    // -----------------------------------------------------------------------
    // Task Creation & Server-Bound Relationship Integrity
    // -----------------------------------------------------------------------
    it("creates a task bound strictly to the verified owner and verified parent project", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${ownerProject._id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Configure Database Pool",
            description: "Set up pool size and keepAlive",
            status: "In Progress",
            priority: "High",
            dueDate: "2026-11-20T00:00:00.000Z",
          }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectTask(req, {
        params: { id: ownerProject._id.toString() },
      });
      assert.equal(res.status, 201);

      const data = await res.json();
      assert.ok(data.task._id);
      assert.equal(data.task.title, "Configure Database Pool");
      assert.equal(data.task.owner.toString(), testOwnerUser._id.toString());
      assert.equal(data.task.project.toString(), ownerProject._id.toString());
      assert.equal(data.task.status, "In Progress");
      assert.equal(data.task.priority, "High");
      assert.equal(data.task.completedAt, null);
    });

    // -----------------------------------------------------------------------
    // Task Listing & Query Scoping
    // -----------------------------------------------------------------------
    it("lists only tasks belonging to the specified project and authenticated owner", async () => {
      if (!process.env.MONGODB_URI) return;

      // Seed a task directly under otherProject
      await Task.create({
        owner: otherUser._id,
        project: otherProject._id,
        title: "Other User Secret Task",
      });

      const req = new Request(
        `http://localhost:3000/api/projects/${ownerProject._id}/tasks?status=In Progress`
      );
      req._testSession = authorizedOwnerSession;
      const res = await getProjectTasks(req, {
        params: { id: ownerProject._id.toString() },
      });
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.ok(Array.isArray(data.tasks));
      assert.ok(data.tasks.length >= 1);
      assert.ok(data.pagination);

      // Verify no task from otherUser appears
      for (const t of data.tasks) {
        assert.equal(t.owner.toString(), testOwnerUser._id.toString());
        assert.equal(t.project.toString(), ownerProject._id.toString());
        assert.equal(t.status, "In Progress");
      }
    });

    it("returns 404 when listing tasks for another owner's project", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${otherProject._id}/tasks`
      );
      req._testSession = authorizedOwnerSession;
      const res = await getProjectTasks(req, {
        params: { id: otherProject._id.toString() },
      });
      assert.equal(res.status, 404);
    });

    // -----------------------------------------------------------------------
    // Single Task Retrieval
    // -----------------------------------------------------------------------
    it("retrieves a single task belonging to the authenticated owner", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.findOne({
        owner: testOwnerUser._id,
        project: ownerProject._id,
      });
      assert.ok(task);

      const req = new Request(`http://localhost:3000/api/tasks/${task._id}`);
      req._testSession = authorizedOwnerSession;
      const res = await getTaskById(req, { params: { id: task._id.toString() } });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.task._id.toString(), task._id.toString());
    });

    it("returns 404 when retrieving a non-existent task or another owner's task", async () => {
      if (!process.env.MONGODB_URI) return;

      const otherTask = await Task.findOne({ owner: otherUser._id });
      assert.ok(otherTask);

      // Owner trying to read otherUser's task
      const req = new Request(`http://localhost:3000/api/tasks/${otherTask._id}`);
      req._testSession = authorizedOwnerSession;
      const res = await getTaskById(req, { params: { id: otherTask._id.toString() } });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Task not found/i);
    });

    // -----------------------------------------------------------------------
    // Completion Timestamp Transitions & Partial Updates (PATCH)
    // -----------------------------------------------------------------------
    it("auto-populates completedAt when task is marked 'Done'", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.findOne({
        owner: testOwnerUser._id,
        project: ownerProject._id,
        status: { $ne: "Done" },
      });
      assert.ok(task);
      assert.equal(task.completedAt, null);

      const patchReq = new Request(`http://localhost:3000/api/tasks/${task._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateTaskById(patchReq, {
        params: { id: task._id.toString() },
      });
      assert.equal(patchRes.status, 200);

      const data = await patchRes.json();
      assert.equal(data.task.status, "Done");
      assert.ok(data.task.completedAt, "Expected completedAt to be auto-populated");
      assert.ok(new Date(data.task.completedAt) <= new Date());
    });

    it("preserves existing completedAt on unrelated updates when task remains 'Done'", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.findOne({
        owner: testOwnerUser._id,
        status: "Done",
      });
      assert.ok(task);
      const originalCompletedAt = task.completedAt.toISOString();

      const patchReq = new Request(`http://localhost:3000/api/tasks/${task._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: "Critical" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateTaskById(patchReq, {
        params: { id: task._id.toString() },
      });
      assert.equal(patchRes.status, 200);

      const data = await patchRes.json();
      assert.equal(data.task.priority, "Critical");
      assert.equal(data.task.status, "Done");
      assert.equal(
        new Date(data.task.completedAt).toISOString(),
        originalCompletedAt,
        "completedAt must not be altered by unrelated field update"
      );
    });

    it("clears completedAt when task transitions from 'Done' back to 'In Progress'", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.findOne({
        owner: testOwnerUser._id,
        status: "Done",
      });
      assert.ok(task);

      const patchReq = new Request(`http://localhost:3000/api/tasks/${task._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "In Progress" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateTaskById(patchReq, {
        params: { id: task._id.toString() },
      });
      assert.equal(patchRes.status, 200);

      const data = await patchRes.json();
      assert.equal(data.task.status, "In Progress");
      assert.equal(data.task.completedAt, null, "completedAt must be cleared when leaving Done");
    });

    it("returns 404 when attempting to PATCH another owner's task", async () => {
      if (!process.env.MONGODB_URI) return;

      const otherTask = await Task.findOne({ owner: otherUser._id });
      assert.ok(otherTask);

      const patchReq = new Request(`http://localhost:3000/api/tasks/${otherTask._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Tampered Title" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateTaskById(patchReq, {
        params: { id: otherTask._id.toString() },
      });
      assert.equal(patchRes.status, 404);
      assert.match((await patchRes.json()).error, /Task not found/i);
    });

    // -----------------------------------------------------------------------
    // Task Deletion & Isolation (DELETE)
    // -----------------------------------------------------------------------
    it("returns 404 when attempting to DELETE another owner's task", async () => {
      if (!process.env.MONGODB_URI) return;

      const otherTask = await Task.findOne({ owner: otherUser._id });
      assert.ok(otherTask);

      const deleteReq = new Request(`http://localhost:3000/api/tasks/${otherTask._id}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;
      const deleteRes = await deleteTaskById(deleteReq, {
        params: { id: otherTask._id.toString() },
      });
      assert.equal(deleteRes.status, 404);
      assert.match((await deleteRes.json()).error, /Task not found/i);

      // Confirm otherUser's task still exists in DB
      const checkOtherTask = await Task.findById(otherTask._id);
      assert.ok(checkOtherTask);
    });

    it("deletes a task owned by the authenticated owner", async () => {
      if (!process.env.MONGODB_URI) return;

      const task = await Task.findOne({
        owner: testOwnerUser._id,
        project: ownerProject._id,
      });
      assert.ok(task);

      const deleteReq = new Request(`http://localhost:3000/api/tasks/${task._id}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;
      const deleteRes = await deleteTaskById(deleteReq, {
        params: { id: task._id.toString() },
      });
      assert.equal(deleteRes.status, 200);

      const data = await deleteRes.json();
      assert.match(data.message, /Task deleted successfully/i);
      assert.equal(data.deletedId, task._id.toString());

      // Confirm document no longer exists
      const checkDeleted = await Task.findById(task._id);
      assert.equal(checkDeleted, null);
    });
  });
});
