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
  GET as getProject,
  PATCH as updateProject,
} from "../src/app/api/projects/[id]/route.js";
import { POST as createProjectRoot } from "../src/app/api/projects/route.js";
import { getProjectDetails } from "../src/lib/api/project-service.js";
import { validateProjectPayload } from "../src/lib/api/project-validation.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";

describe("Phase 5A Step 4: Project Editing UI & API Tests", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "4433221100";
  const mockOtherGithubId = "0011223344";

  const authorizedOwnerSession = {
    user: {
      name: "Edit Owner",
      email: "owner.edit@example.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Stranger Visitor",
      email: "stranger.edit@example.local",
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
    await User.init();

    // Clean existing test fixtures
    await User.deleteMany({
      githubId: { $in: [mockOwnerGithubId, mockOtherGithubId] },
    });

    testOwnerUser = await User.create({
      name: "Edit Owner",
      email: "owner.edit@example.local",
      githubId: mockOwnerGithubId,
    });

    otherUser = await User.create({
      name: "Stranger User",
      email: "stranger.edit@example.local",
      githubId: mockOtherGithubId,
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

  beforeEach(() => {
    process.env = { ...originalEnv, OWNER_GITHUB_ID: mockOwnerGithubId };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. Validation & Payload Sanitization for Editing (Offline / Unit Tests)
  // =========================================================================
  describe("1. Project Update Validation (Offline / Unit Tests)", () => {
    it("accepts valid partial updates in update mode (isUpdate = true)", () => {
      const { isValid, errors, sanitized } = validateProjectPayload(
        { title: "Updated Project Title", priority: "Critical" },
        true
      );
      assert.equal(isValid, true);
      assert.equal(errors.length, 0);
      assert.equal(sanitized.title, "Updated Project Title");
      assert.equal(sanitized.priority, "Critical");
    });

    it("rejects attempt to modify protected fields (owner, _id, isDeleting, timestamps)", () => {
      const maliciousPayload = {
        title: "Malicious Edit",
        owner: new mongoose.Types.ObjectId().toString(),
        isDeleting: true,
        _id: new mongoose.Types.ObjectId().toString(),
      };
      const { isValid, errors } = validateProjectPayload(maliciousPayload, true);
      assert.equal(isValid, false);
      assert.ok(errors.some((e) => e.includes("owner")));
      assert.ok(errors.some((e) => e.includes("isDeleting")));
      assert.ok(errors.some((e) => e.includes("_id")));
    });

    it("rejects title exceeding 150 characters or empty title on update", () => {
      const longTitle = "A".repeat(151);
      const res1 = validateProjectPayload({ title: longTitle }, true);
      assert.equal(res1.isValid, false);
      assert.ok(res1.errors.some((e) => e.includes("cannot exceed 150 characters")));

      const res2 = validateProjectPayload({ title: "   " }, true);
      assert.equal(res2.isValid, false);
      assert.ok(res2.errors.some((e) => e.includes("Title is required")));
    });

    it("rejects shortDescription exceeding 300 characters on update", () => {
      const longDesc = "B".repeat(301);
      const res = validateProjectPayload({ shortDescription: longDesc }, true);
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes("cannot exceed 300 characters")));
    });

    it("rejects invalid status or priority enums on update", () => {
      const res1 = validateProjectPayload({ status: "InvalidStatus" }, true);
      assert.equal(res1.isValid, false);
      assert.ok(res1.errors.some((e) => e.includes("Status must be one of")));

      const res2 = validateProjectPayload({ priority: "UltraHigh" }, true);
      assert.equal(res2.isValid, false);
      assert.ok(res2.errors.some((e) => e.includes("Priority must be one of")));
    });

    it("rejects invalid URL formats in repositoryUrl or demoUrl on update", () => {
      const res = validateProjectPayload(
        { repositoryUrl: "ftp://invalid-protocol", demoUrl: "not-a-url" },
        true
      );
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes("repositoryUrl")));
      assert.ok(res.errors.some((e) => e.includes("demoUrl")));
    });

    it("allows clearing optional URLs or dates by passing null or empty string", () => {
      const res = validateProjectPayload(
        {
          repositoryUrl: "",
          liveUrl: null,
          startDate: "",
          deadline: null,
        },
        true
      );
      assert.equal(res.isValid, true);
      assert.equal(res.sanitized.repositoryUrl, null);
      assert.equal(res.sanitized.liveUrl, null);
      assert.equal(res.sanitized.startDate, null);
      assert.equal(res.sanitized.deadline, null);
    });
  });

  // =========================================================================
  // 2. Authorization & Input Boundaries for PATCH (Offline / Unit Tests)
  // =========================================================================
  describe("2. Authorization & Routing Boundaries (Offline / Unit Tests)", () => {
    const dummyId = "507f1f77bcf86cd799439011";

    it("returns 401 when visitor is unauthenticated on PATCH /api/projects/[id]", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${dummyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
      const res = await updateProject(req, { params: Promise.resolve({ id: dummyId }) });
      assert.equal(res.status, 401);
      assert.match((await res.json()).error, /Authentication required/i);
    });

    it("returns 403 when authenticated visitor is not the owner on PATCH /api/projects/[id]", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${dummyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
      req._testSession = unauthorizedVisitorSession;
      const res = await updateProject(req, { params: Promise.resolve({ id: dummyId }) });
      assert.equal(res.status, 403);
      assert.match((await res.json()).error, /Owner authorization required/i);
    });

    it("returns 400 when route parameter is an invalid ObjectId format", async () => {
      const req = new Request("http://localhost:3000/api/projects/not-valid-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
      req._testSession = authorizedOwnerSession;
      const res = await updateProject(req, { params: Promise.resolve({ id: "not-valid-id" }) });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /Invalid project ID format/i);
    });

    it("returns 400 when PATCH request body has no valid mutable fields", async () => {
      const req = new Request(`http://localhost:3000/api/projects/${dummyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      req._testSession = authorizedOwnerSession;
      const res = await updateProject(req, { params: Promise.resolve({ id: dummyId }) });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /No valid fields provided/i);
    });
  });

  // =========================================================================
  // 3. Project Prepopulation & Live MongoDB Update Integration Tests
  // =========================================================================
  describe("3. Project Editing & Prepopulation Integration (Live MongoDB)", () => {
    let testProject;
    let existingProjectWithSlug;
    let strangerProject;

    beforeEach(async () => {
      if (!process.env.MONGODB_URI) return;
      await Task.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Project.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });

      testProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Original Project Name",
        slug: "original-project-name",
        shortDescription: "Original short description",
        description: "Full extended architecture specs",
        category: "Backend",
        status: "Planned",
        priority: "Medium",
        visibility: "Private",
        techStack: ["Node.js", "Express"],
        tags: ["api", "service"],
        repositoryUrl: "https://github.com/owner/original",
        progress: 20,
      });

      existingProjectWithSlug = await Project.create({
        owner: testOwnerUser._id,
        title: "Conflicting Project",
        slug: "already-taken-slug",
        shortDescription: "A second project owned by the same user",
      });

      strangerProject = await Project.create({
        owner: otherUser._id,
        title: "Stranger Secret Repo",
        slug: "stranger-secret-repo",
        shortDescription: "Should be completely inaccessible",
      });
    });

    it("loads and prepopulates saved project data for editing via getProjectDetails", async () => {
      if (!process.env.MONGODB_URI) return;

      const details = await getProjectDetails({
        projectId: testProject._id,
        ownerId: testOwnerUser._id,
      });

      assert.ok(details);
      assert.ok(details.project);
      assert.equal(details.project.title, "Original Project Name");
      assert.equal(details.project.slug, "original-project-name");
      assert.equal(details.project.shortDescription, "Original short description");
      assert.equal(details.project.description, "Full extended architecture specs");
      assert.equal(details.project.category, "Backend");
      assert.equal(details.project.status, "Planned");
      assert.equal(details.project.priority, "Medium");
      assert.deepEqual(details.project.techStack, ["Node.js", "Express"]);
      assert.deepEqual(details.project.tags, ["api", "service"]);
      assert.equal(details.project.repositoryUrl, "https://github.com/owner/original");
    });

    it("enforces tenant isolation: stranger cannot view or load owner's project for editing", async () => {
      if (!process.env.MONGODB_URI) return;

      // Stranger trying to load testOwnerUser's project
      const strangerLoad = await getProjectDetails({
        projectId: testProject._id,
        ownerId: otherUser._id,
      });
      assert.equal(strangerLoad, null);

      // Owner trying to load stranger's project
      const ownerLoadStranger = await getProjectDetails({
        projectId: strangerProject._id,
        ownerId: testOwnerUser._id,
      });
      assert.equal(ownerLoadStranger, null);
    });

    it("updates supported project fields successfully via PATCH /api/projects/[id]", async () => {
      if (!process.env.MONGODB_URI) return;

      const updatePayload = {
        title: "Modernized Event Platform",
        category: "Cloud Native",
        status: "In Progress",
        priority: "High",
        visibility: "Public",
        shortDescription: "Updated technical summary for the event pipeline",
        description: "New updated markdown specification",
        techStack: ["Go", "Kafka", "Docker"],
        tags: ["streaming", "distributed"],
        liveUrl: "https://events.example.com",
        repositoryUrl: "https://github.com/owner/events-v2",
        progress: 40,
        notes: "Sprint 4 active focus",
      };

      const req = new Request(`http://localhost:3000/api/projects/${testProject._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      req._testSession = authorizedOwnerSession;

      const res = await updateProject(req, {
        params: Promise.resolve({ id: testProject._id.toString() }),
      });
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.ok(data.project);
      assert.equal(data.project.title, "Modernized Event Platform");
      assert.equal(data.project.category, "Cloud Native");
      assert.equal(data.project.status, "In Progress");
      assert.equal(data.project.priority, "High");
      assert.equal(data.project.visibility, "Public");
      assert.deepEqual(data.project.techStack, ["Go", "Kafka", "Docker"]);
      assert.deepEqual(data.project.tags, ["streaming", "distributed"]);
      assert.equal(data.project.liveUrl, "https://events.example.com");
      assert.equal(data.project.repositoryUrl, "https://github.com/owner/events-v2");
      assert.equal(data.project.notes, "Sprint 4 active focus");

      // Verify in DB directly
      const dbProject = await Project.findById(testProject._id);
      assert.equal(dbProject.title, "Modernized Event Platform");
      assert.equal(dbProject.status, "In Progress");
    });

    it("rejects duplicate slug conflict with 409 Conflict when updating to an existing slug", async () => {
      if (!process.env.MONGODB_URI) return;

      const conflictReq = new Request(
        `http://localhost:3000/api/projects/${testProject._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "already-taken-slug", // Belongs to existingProjectWithSlug
          }),
        }
      );
      conflictReq._testSession = authorizedOwnerSession;

      const res = await updateProject(conflictReq, {
        params: Promise.resolve({ id: testProject._id.toString() }),
      });
      assert.equal(res.status, 409);
      assert.match((await res.json()).error, /already exists/i);
    });

    it("allows keeping the project's own slug during an edit without 409 conflict", async () => {
      if (!process.env.MONGODB_URI) return;

      const sameSlugReq = new Request(
        `http://localhost:3000/api/projects/${testProject._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Updated Title With Same Slug",
            slug: "original-project-name", // testProject's own existing slug
          }),
        }
      );
      sameSlugReq._testSession = authorizedOwnerSession;

      const res = await updateProject(sameSlugReq, {
        params: Promise.resolve({ id: testProject._id.toString() }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.project.title, "Updated Title With Same Slug");
      assert.equal(data.project.slug, "original-project-name");
    });

    it("returns 404 when attempting to PATCH a project owned by another user (IDOR prevention)", async () => {
      if (!process.env.MONGODB_URI) return;

      const unauthorizedEditReq = new Request(
        `http://localhost:3000/api/projects/${strangerProject._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Infiltrated Title" }),
        }
      );
      unauthorizedEditReq._testSession = authorizedOwnerSession;

      const res = await updateProject(unauthorizedEditReq, {
        params: Promise.resolve({ id: strangerProject._id.toString() }),
      });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);

      // Verify stranger's project remained untouched
      const dbStrangerProject = await Project.findById(strangerProject._id);
      assert.equal(dbStrangerProject.title, "Stranger Secret Repo");
    });

    it("clears optional date and URL fields when passed null in PATCH payload", async () => {
      if (!process.env.MONGODB_URI) return;

      const clearReq = new Request(
        `http://localhost:3000/api/projects/${testProject._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repositoryUrl: null,
            startDate: null,
          }),
        }
      );
      clearReq._testSession = authorizedOwnerSession;

      const res = await updateProject(clearReq, {
        params: Promise.resolve({ id: testProject._id.toString() }),
      });
      assert.equal(res.status, 200);

      const dbProject = await Project.findById(testProject._id);
      assert.equal(dbProject.repositoryUrl, null);
      assert.equal(dbProject.startDate, null);
    });

    it("preserves task-driven progress calculation after project edits", async () => {
      if (!process.env.MONGODB_URI) return;

      // Seed 2 tasks (1 Done, 1 In Progress) -> 50%
      await Task.create([
        {
          owner: testOwnerUser._id,
          project: testProject._id,
          title: "Critical Task 1",
          status: "Done",
        },
        {
          owner: testOwnerUser._id,
          project: testProject._id,
          title: "Critical Task 2",
          status: "In Progress",
        },
      ]);

      // Edit project title and priority
      const editReq = new Request(
        `http://localhost:3000/api/projects/${testProject._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Project With Active Tasks",
            priority: "Critical",
          }),
        }
      );
      editReq._testSession = authorizedOwnerSession;

      const res = await updateProject(editReq, {
        params: Promise.resolve({ id: testProject._id.toString() }),
      });
      assert.equal(res.status, 200);

      // Retrieve full details via getProjectDetails
      const details = await getProjectDetails({
        projectId: testProject._id,
        ownerId: testOwnerUser._id,
      });

      assert.equal(details.project.title, "Project With Active Tasks");
      assert.equal(details.project.priority, "Critical");
      // Task-driven progress remains 50%
      assert.equal(details.project.progress, 50);
      assert.equal(details.project.progressSource, "tasks");
      assert.equal(details.stats.taskCounts.total, 2);
      assert.equal(details.stats.taskCounts.completed, 1);
    });
  });
});
