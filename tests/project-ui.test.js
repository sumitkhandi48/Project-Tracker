import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Load local environment safely if available
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not found or already loaded
}

import { GET as getProjects, POST as createProject } from "../src/app/api/projects/route.js";
import { getProjectsList } from "../src/lib/api/project-service.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";

describe("Phase 5A Step 2: Project Listing & Creation UI Tests", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "6655443322";
  const mockOtherGithubId = "6677889900";

  const authorizedOwnerSession = {
    user: {
      name: "Projects Owner",
      email: "owner.projects@example.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Non-Owner Visitor",
      email: "visitor.projects@example.local",
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
      name: "Projects Owner",
      email: "owner.projects@example.local",
      githubId: mockOwnerGithubId,
    });

    otherUser = await User.create({
      name: "Other User",
      email: "other.projects@example.local",
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
  // 1. Authorization Boundaries (Offline / Unit Tests)
  // =========================================================================
  describe("1. Authorization Boundaries (Offline / Unit Tests)", () => {
    it("returns 401 when visitor is unauthenticated on GET /api/projects", async () => {
      const req = new Request("http://localhost:3000/api/projects", { method: "GET" });
      const res = await getProjects(req);
      assert.equal(res.status, 401);
      assert.match((await res.json()).error, /Authentication required/i);
    });

    it("returns 403 when authenticated as a non-owner visitor on GET /api/projects", async () => {
      const req = new Request("http://localhost:3000/api/projects", { method: "GET" });
      req._testSession = unauthorizedVisitorSession;
      const res = await getProjects(req);
      assert.equal(res.status, 403);
      assert.match((await res.json()).error, /Owner authorization required/i);
    });

    it("returns 401 when visitor is unauthenticated on POST /api/projects", async () => {
      const req = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test Project", shortDescription: "Desc" }),
      });
      const res = await createProject(req);
      assert.equal(res.status, 401);
    });

    it("returns 403 when authenticated as a non-owner visitor on POST /api/projects", async () => {
      const req = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test Project", shortDescription: "Desc" }),
      });
      req._testSession = unauthorizedVisitorSession;
      const res = await createProject(req);
      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // 2. Project Creation API & Payload Validation (Integration Tests)
  // =========================================================================
  describe("2. Project Creation API & Payload Handling (Live MongoDB)", () => {
    beforeEach(async () => {
      if (!process.env.MONGODB_URI) return;
      await Task.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Project.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
    });

    it("creates a new project and auto-generates slug from title when slug is omitted", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "My Super Platform",
          shortDescription: "A distributed microservice engine",
          category: "Infrastructure",
          priority: "High",
          status: "In Progress",
          visibility: "Private",
          techStack: ["Node.js", "Docker", "RabbitMQ"],
          tags: ["infra", "event-driven"],
        }),
      });
      req._testSession = authorizedOwnerSession;

      const res = await createProject(req);
      assert.equal(res.status, 201);

      const data = await res.json();
      assert.ok(data.project);
      assert.equal(data.project.title, "My Super Platform");
      assert.equal(data.project.slug, "my-super-platform"); // Auto-generated
      assert.equal(data.project.category, "Infrastructure");
      assert.equal(data.project.priority, "High");
      assert.equal(data.project.status, "In Progress");
      assert.deepEqual(data.project.techStack, ["Node.js", "Docker", "RabbitMQ"]);
      assert.deepEqual(data.project.tags, ["infra", "event-driven"]);
      assert.equal(data.project.owner, testOwnerUser._id.toString());
    });

    it("rejects project creation when title or shortDescription is missing (400)", async () => {
      if (!process.env.MONGODB_URI) return;

      // Missing title
      const req1 = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortDescription: "Some desc without title" }),
      });
      req1._testSession = authorizedOwnerSession;
      const res1 = await createProject(req1);
      assert.equal(res1.status, 400);

      // Missing shortDescription
      const req2 = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Valid Title" }),
      });
      req2._testSession = authorizedOwnerSession;
      const res2 = await createProject(req2);
      assert.equal(res2.status, 400);
    });

    it("rejects attempts to inject protected fields like owner, _id, or isDeleting (400)", async () => {
      if (!process.env.MONGODB_URI) return;

      const maliciousReq = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Malicious Project",
          shortDescription: "Valid desc",
          owner: new mongoose.Types.ObjectId().toString(),
          isDeleting: true,
        }),
      });
      maliciousReq._testSession = authorizedOwnerSession;

      const res = await createProject(maliciousReq);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.errors.some((e) => e.includes("owner") || e.includes("isDeleting")));
    });

    it("rejects duplicate slug for the same owner with 409 Conflict", async () => {
      if (!process.env.MONGODB_URI) return;

      await Project.create({
        owner: testOwnerUser._id,
        title: "Original Project",
        slug: "unique-slug-conflict",
        shortDescription: "Original project short description",
      });

      const duplicateReq = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Another Project",
          slug: "unique-slug-conflict",
          shortDescription: "Attempts to reuse slug",
        }),
      });
      duplicateReq._testSession = authorizedOwnerSession;

      const res = await createProject(duplicateReq);
      assert.equal(res.status, 409);
      assert.match((await res.json()).error, /already exists/i);
    });

    it("rejects invalid URL formats in repositoryUrl or demoUrl (400)", async () => {
      if (!process.env.MONGODB_URI) return;

      const badUrlReq = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Bad URL Project",
          shortDescription: "Valid description",
          repositoryUrl: "not-a-valid-url",
        }),
      });
      badUrlReq._testSession = authorizedOwnerSession;

      const res = await createProject(badUrlReq);
      assert.equal(res.status, 400);
      assert.ok((await res.json()).errors.some((e) => e.includes("repositoryUrl")));
    });
  });

  // =========================================================================
  // 3. Project Listing, Filtering, Search & Pagination (Integration Tests)
  // =========================================================================
  describe("3. Project Listing Service & Search Filtering (Live MongoDB)", () => {
    beforeEach(async () => {
      if (!process.env.MONGODB_URI) return;
      await Task.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });
      await Project.deleteMany({ owner: { $in: [testOwnerUser._id, otherUser._id] } });

      // Seed 6 distinct projects for testOwnerUser
      await Project.create([
        {
          owner: testOwnerUser._id,
          title: "Alpha Service",
          slug: "alpha-service",
          shortDescription: "Core messaging gateway",
          category: "Backend",
          status: "In Progress",
          priority: "Critical",
          techStack: ["Go", "Kafka"],
          tags: ["core", "infra"],
          progress: 50,
        },
        {
          owner: testOwnerUser._id,
          title: "Beta UI",
          slug: "beta-ui",
          shortDescription: "Next.js frontend dashboard",
          category: "Frontend",
          status: "Completed",
          priority: "High",
          techStack: ["Next.js", "React"],
          tags: ["ui", "web"],
          progress: 100,
        },
        {
          owner: testOwnerUser._id,
          title: "Gamma Parser",
          slug: "gamma-parser",
          shortDescription: "AST and binary parser library",
          category: "Tooling",
          status: "Planned",
          priority: "Medium",
          techStack: ["Rust"],
          tags: ["compiler"],
          progress: 0,
        },
        {
          owner: testOwnerUser._id,
          title: "Delta Stream",
          slug: "delta-stream",
          shortDescription: "Realtime data processing engine",
          category: "Backend",
          status: "In Progress",
          priority: "High",
          techStack: ["Python", "Flink"],
          tags: ["data"],
          progress: 30,
        },
        {
          owner: testOwnerUser._id,
          title: "Epsilon Docs",
          slug: "epsilon-docs",
          shortDescription: "Static documentation generator",
          category: "Tooling",
          status: "On Hold",
          priority: "Low",
          techStack: ["Astro"],
          tags: ["docs"],
          progress: 10,
        },
        {
          owner: testOwnerUser._id,
          title: "Zeta Auth",
          slug: "zeta-auth",
          shortDescription: "OAuth2 authentication provider",
          category: "Security",
          status: "In Progress",
          priority: "Critical",
          techStack: ["Node.js", "Redis"],
          tags: ["security"],
          progress: 80,
        },
      ]);

      // Seed a project for otherUser to verify cross-owner isolation
      await Project.create({
        owner: otherUser._id,
        title: "Other User Secret Project",
        slug: "other-user-secret",
        shortDescription: "Must be completely invisible to testOwnerUser",
        status: "In Progress",
      });
    });

    it("lists only projects belonging to the verified owner", async () => {
      if (!process.env.MONGODB_URI) return;

      const data = await getProjectsList({ ownerId: testOwnerUser._id });
      assert.equal(data.pagination.total, 6);
      assert.equal(data.projects.length, 6);
      assert.ok(data.projects.every((p) => p.owner === testOwnerUser._id.toString()));
      assert.ok(!data.projects.some((p) => p.slug === "other-user-secret"));
    });

    it("filters projects by status enum accurately", async () => {
      if (!process.env.MONGODB_URI) return;

      // Filter: In Progress (Alpha, Delta, Zeta = 3)
      const inProgressData = await getProjectsList({
        ownerId: testOwnerUser._id,
        status: "In Progress",
      });
      assert.equal(inProgressData.pagination.total, 3);
      assert.ok(inProgressData.projects.every((p) => p.status === "In Progress"));

      // Filter: Completed (Beta = 1)
      const completedData = await getProjectsList({
        ownerId: testOwnerUser._id,
        status: "Completed",
      });
      assert.equal(completedData.pagination.total, 1);
      assert.equal(completedData.projects[0].title, "Beta UI");
    });

    it("filters projects by search keyword across title, description, tags, and techStack", async () => {
      if (!process.env.MONGODB_URI) return;

      // Search by techStack keyword "Rust" -> Gamma Parser
      const rustSearch = await getProjectsList({
        ownerId: testOwnerUser._id,
        search: "Rust",
      });
      assert.equal(rustSearch.pagination.total, 1);
      assert.equal(rustSearch.projects[0].title, "Gamma Parser");

      // Search by description keyword "gateway" -> Alpha Service
      const descSearch = await getProjectsList({
        ownerId: testOwnerUser._id,
        search: "gateway",
      });
      assert.equal(descSearch.pagination.total, 1);
      assert.equal(descSearch.projects[0].title, "Alpha Service");

      // Search by tag keyword "security" -> Zeta Auth
      const tagSearch = await getProjectsList({
        ownerId: testOwnerUser._id,
        search: "security",
      });
      assert.equal(tagSearch.pagination.total, 1);
      assert.equal(tagSearch.projects[0].title, "Zeta Auth");
    });

    it("supports pagination boundaries with hasNextPage and hasPrevPage", async () => {
      if (!process.env.MONGODB_URI) return;

      // Page 1 with limit 2 -> 2 items, total 6, totalPages 3, hasNextPage = true, hasPrevPage = false
      const page1 = await getProjectsList({
        ownerId: testOwnerUser._id,
        page: 1,
        limit: 2,
      });
      assert.equal(page1.pagination.total, 6);
      assert.equal(page1.pagination.page, 1);
      assert.equal(page1.pagination.limit, 2);
      assert.equal(page1.pagination.totalPages, 3);
      assert.equal(page1.pagination.hasNextPage, true);
      assert.equal(page1.pagination.hasPrevPage, false);
      assert.equal(page1.projects.length, 2);

      // Page 2 with limit 2 -> 2 items, hasNextPage = true, hasPrevPage = true
      const page2 = await getProjectsList({
        ownerId: testOwnerUser._id,
        page: 2,
        limit: 2,
      });
      assert.equal(page2.pagination.page, 2);
      assert.equal(page2.pagination.hasNextPage, true);
      assert.equal(page2.pagination.hasPrevPage, true);

      // Page 3 with limit 2 -> 2 items, hasNextPage = false, hasPrevPage = true
      const page3 = await getProjectsList({
        ownerId: testOwnerUser._id,
        page: 3,
        limit: 2,
      });
      assert.equal(page3.pagination.page, 3);
      assert.equal(page3.pagination.hasNextPage, false);
      assert.equal(page3.pagination.hasPrevPage, true);
    });

    it("calculates progress dynamically from tasks when tasks exist for a project", async () => {
      if (!process.env.MONGODB_URI) return;

      const alphaProject = await Project.findOne({
        owner: testOwnerUser._id,
        slug: "alpha-service",
      });

      // Add 2 tasks (1 Done, 1 Todo) -> 50%
      await Task.create([
        {
          owner: testOwnerUser._id,
          project: alphaProject._id,
          title: "Alpha Task 1",
          status: "Done",
        },
        {
          owner: testOwnerUser._id,
          project: alphaProject._id,
          title: "Alpha Task 2",
          status: "Todo",
        },
      ]);

      const data = await getProjectsList({
        ownerId: testOwnerUser._id,
        search: "Alpha Service",
      });
      assert.equal(data.projects.length, 1);
      assert.equal(data.projects[0].progress, 50);
      assert.equal(data.projects[0].progressSource, "tasks");
      assert.equal(data.projects[0].taskCounts.total, 2);
      assert.equal(data.projects[0].taskCounts.completed, 1);
    });

    it("returns empty result array when search matches no documents", async () => {
      if (!process.env.MONGODB_URI) return;

      const emptyData = await getProjectsList({
        ownerId: testOwnerUser._id,
        search: "nonexistent-keyword-xyz-999",
      });
      assert.equal(emptyData.pagination.total, 0);
      assert.deepEqual(emptyData.projects, []);
    });
  });
});
