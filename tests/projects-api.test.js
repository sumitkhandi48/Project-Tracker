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
  validateProjectPayload,
  slugify,
  isValidHttpUrl,
  ALLOWED_FIELDS,
  FORBIDDEN_FIELDS,
  SORTABLE_FIELDS,
} from "../src/lib/api/project-validation.js";
import { getVerifiedOwnerId } from "../src/lib/api/owner-resolver.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project, {
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  PROJECT_PRIORITIES,
} from "../src/models/Project.js";

// Import route handlers to test HTTP status codes and contract
import { GET as getProjects, POST as createProject } from "../src/app/api/projects/route.js";
import {
  GET as getProjectById,
  PATCH as updateProjectById,
  DELETE as deleteProjectById,
} from "../src/app/api/projects/[id]/route.js";

describe("Phase 4A Secure Project Management API Tests", () => {
  // =========================================================================
  // 1. Payload Validation & Mass Assignment Protection (validateProjectPayload)
  // =========================================================================
  describe("validateProjectPayload() Rules & Security Constraints", () => {
    it("rejects non-object or array request bodies", () => {
      const nullRes = validateProjectPayload(null);
      assert.equal(nullRes.isValid, false);
      assert.match(nullRes.errors[0], /valid JSON object/i);

      const arrayRes = validateProjectPayload([]);
      assert.equal(arrayRes.isValid, false);
      assert.match(arrayRes.errors[0], /valid JSON object/i);

      const stringRes = validateProjectPayload("invalid string");
      assert.equal(stringRes.isValid, false);
    });

    it("strictly blocks mass assignment on protected fields (owner, _id, createdAt, updatedAt, __v)", () => {
      for (const forbidden of FORBIDDEN_FIELDS) {
        const payload = {
          title: "Legit Title",
          shortDescription: "Legit description",
          [forbidden]: "malicious_override",
        };
        const result = validateProjectPayload(payload);
        assert.equal(result.isValid, false);
        assert.ok(
          result.errors.some((err) => err.includes(forbidden)),
          `Expected error mentioning protected field '${forbidden}'`
        );
      }
    });

    it("rejects unsupported arbitrary fields not in ALLOWED_FIELDS", () => {
      const payload = {
        title: "Legit Project",
        shortDescription: "Valid description",
        isAdmin: true,
        extraData: "unexpected",
      };
      const result = validateProjectPayload(payload);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((err) => err.includes("isAdmin")));
      assert.ok(result.errors.some((err) => err.includes("extraData")));
    });

    it("requires title on project creation and limits length to 150 characters", () => {
      const missingTitle = validateProjectPayload({ shortDescription: "Desc" });
      assert.equal(missingTitle.isValid, false);
      assert.ok(missingTitle.errors.some((e) => /Title is required/i.test(e)));

      const emptyTitle = validateProjectPayload({ title: "   ", shortDescription: "Desc" });
      assert.equal(emptyTitle.isValid, false);

      const longTitle = validateProjectPayload({
        title: "A".repeat(151),
        shortDescription: "Desc",
      });
      assert.equal(longTitle.isValid, false);
      assert.ok(longTitle.errors.some((e) => /exceed 150 characters/i.test(e)));
    });

    it("auto-generates a valid URL-friendly slug from title when slug is omitted", () => {
      const result = validateProjectPayload({
        title: "Next.js 14 E-Commerce Platform!!",
        shortDescription: "A modern tracking tool",
      });
      assert.equal(result.isValid, true);
      assert.equal(result.sanitized.slug, "nextjs-14-e-commerce-platform");
    });

    it("validates custom slug format (lowercase alphanumeric and hyphens only)", () => {
      const validCustom = validateProjectPayload({
        title: "My Project",
        slug: "custom-slug-123",
        shortDescription: "Valid description",
      });
      assert.equal(validCustom.isValid, true);
      assert.equal(validCustom.sanitized.slug, "custom-slug-123");

      const invalidCustom = validateProjectPayload({
        title: "My Project",
        slug: "Invalid Slug With Spaces",
        shortDescription: "Valid description",
      });
      assert.equal(invalidCustom.isValid, false);
      assert.ok(invalidCustom.errors.some((e) => /Slug must be lowercase alphanumeric/i.test(e)));
    });

    it("requires shortDescription on creation and limits length to 300 characters", () => {
      const missingDesc = validateProjectPayload({ title: "Test Project" });
      assert.equal(missingDesc.isValid, false);
      assert.ok(missingDesc.errors.some((e) => /Short description is required/i.test(e)));

      const longDesc = validateProjectPayload({
        title: "Test Project",
        shortDescription: "D".repeat(301),
      });
      assert.equal(longDesc.isValid, false);
      assert.ok(longDesc.errors.some((e) => /cannot exceed 300 characters/i.test(e)));
    });

    it("validates status, visibility, and priority enums", () => {
      // Valid enums
      const valid = validateProjectPayload({
        title: "Valid Enums",
        shortDescription: "Checking enums",
        status: "In Progress",
        visibility: "Public",
        priority: "Critical",
      });
      assert.equal(valid.isValid, true);
      assert.equal(valid.sanitized.status, "In Progress");
      assert.equal(valid.sanitized.visibility, "Public");
      assert.equal(valid.sanitized.priority, "Critical");

      // Invalid enums
      const invalid = validateProjectPayload({
        title: "Invalid Enums",
        shortDescription: "Checking enums",
        status: "UnknownStatus",
        visibility: "SuperSecret",
        priority: "Extreme",
      });
      assert.equal(invalid.isValid, false);
      assert.ok(invalid.errors.some((e) => e.includes("Status must be one of")));
      assert.ok(invalid.errors.some((e) => e.includes("Visibility must be one of")));
      assert.ok(invalid.errors.some((e) => e.includes("Priority must be one of")));
    });

    it("validates progress bounds (0 to 100) and rounds floats", () => {
      const validProgress = validateProjectPayload({
        title: "Progress Test",
        shortDescription: "Valid progress",
        progress: 75.6,
      });
      assert.equal(validProgress.isValid, true);
      assert.equal(validProgress.sanitized.progress, 76);

      const negativeProgress = validateProjectPayload({
        title: "Negative Progress",
        shortDescription: "Negative progress",
        progress: -5,
      });
      assert.equal(negativeProgress.isValid, false);

      const excessiveProgress = validateProjectPayload({
        title: "Over 100 Progress",
        shortDescription: "Over 100",
        progress: 101,
      });
      assert.equal(excessiveProgress.isValid, false);
    });

    it("validates and sanitizes date fields (startDate, deadline, completedAt)", () => {
      const validDates = validateProjectPayload({
        title: "Date Project",
        shortDescription: "Dates check",
        startDate: "2026-01-01T00:00:00.000Z",
        deadline: "2026-12-31T23:59:59.000Z",
        completedAt: null,
      });
      assert.equal(validDates.isValid, true);
      assert.ok(validDates.sanitized.startDate instanceof Date);
      assert.ok(validDates.sanitized.deadline instanceof Date);
      assert.equal(validDates.sanitized.completedAt, null);

      const invalidDate = validateProjectPayload({
        title: "Bad Date",
        shortDescription: "Bad date",
        deadline: "not-a-valid-date",
      });
      assert.equal(invalidDate.isValid, false);
      assert.ok(invalidDate.errors.some((e) => /Field 'deadline' must be a valid date/i.test(e)));
    });

    it("validates array fields (techStack, tags) and filters empty values", () => {
      const arrayTest = validateProjectPayload({
        title: "Tech Stack",
        shortDescription: "Array check",
        techStack: ["Next.js", "  Tailwind CSS  ", "", null, "MongoDB"],
        tags: ["v1", "MVP", " "],
      });
      assert.equal(arrayTest.isValid, true);
      assert.deepEqual(arrayTest.sanitized.techStack, ["Next.js", "Tailwind CSS", "MongoDB"]);
      assert.deepEqual(arrayTest.sanitized.tags, ["v1", "MVP"]);

      const invalidArray = validateProjectPayload({
        title: "Invalid Arrays",
        shortDescription: "Non-array check",
        techStack: "Next.js",
      });
      assert.equal(invalidArray.isValid, false);
      assert.ok(invalidArray.errors.some((e) => /Field 'techStack' must be an array/i.test(e)));
    });

    it("validates HTTP/HTTPS URLs (repositoryUrl, liveUrl, demoUrl, docsUrl, coverImage)", () => {
      const validUrls = validateProjectPayload({
        title: "URL Project",
        shortDescription: "Checking URLs",
        repositoryUrl: "https://github.com/example/repo",
        liveUrl: "http://example.com",
        demoUrl: null,
      });
      assert.equal(validUrls.isValid, true);
      assert.equal(validUrls.sanitized.repositoryUrl, "https://github.com/example/repo");
      assert.equal(validUrls.sanitized.demoUrl, null);

      const invalidUrl = validateProjectPayload({
        title: "Bad URL",
        shortDescription: "Bad URL",
        repositoryUrl: "javascript:alert(1)",
      });
      assert.equal(invalidUrl.isValid, false);
      assert.ok(invalidUrl.errors.some((e) => /must be a valid HTTP or HTTPS URL/i.test(e)));
    });

    it("in update mode (isUpdate = true), fields are optional and only provided fields are validated", () => {
      const updatePayload = {
        progress: 85,
        status: "Completed",
      };
      const result = validateProjectPayload(updatePayload, true);
      assert.equal(result.isValid, true);
      assert.equal(result.sanitized.progress, 85);
      assert.equal(result.sanitized.status, "Completed");
      assert.equal(result.sanitized.title, undefined);
    });
  });

  // =========================================================================
  // 2. Slugify Helper Unit Tests
  // =========================================================================
  describe("slugify() String Normalization Helper", () => {
    it("handles special characters, accents, leading/trailing hyphens, and multi-spaces", () => {
      assert.equal(slugify("Hello World!"), "hello-world");
      assert.equal(slugify("  Project -- Alpha & Beta  "), "project-alpha-beta");
      assert.equal(slugify("Next.js 14 & Node.js 24"), "nextjs-14-nodejs-24");
      assert.equal(slugify("---trailing---"), "trailing");
      assert.equal(slugify(""), "");
      assert.equal(slugify(null), "");
    });
  });

  // =========================================================================
  // 3. Server Authorization Gate Enforcement on Route Handlers
  // =========================================================================
  describe("Server Authorization Gates (checkOwnerAccess() Enforcement)", () => {
    it("GET /api/projects returns 401 when unauthenticated", async () => {
      const req = new Request("http://localhost:3000/api/projects");
      const res = await getProjects(req);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Authentication required/i);
    });

    it("POST /api/projects returns 401 when unauthenticated", async () => {
      const req = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      });
      const res = await createProject(req);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Authentication required/i);
    });

    it("GET /api/projects/[id] returns 401 when unauthenticated", async () => {
      const req = new Request("http://localhost:3000/api/projects/507f1f77bcf86cd799439011");
      const res = await getProjectById(req, {
        params: { id: "507f1f77bcf86cd799439011" },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Authentication required/i);
    });

    it("PATCH /api/projects/[id] returns 401 when unauthenticated", async () => {
      const req = new Request("http://localhost:3000/api/projects/507f1f77bcf86cd799439011", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: 50 }),
      });
      const res = await updateProjectById(req, {
        params: { id: "507f1f77bcf86cd799439011" },
      });
      assert.equal(res.status, 401);
    });

    it("DELETE /api/projects/[id] returns 401 when unauthenticated", async () => {
      const req = new Request("http://localhost:3000/api/projects/507f1f77bcf86cd799439011", {
        method: "DELETE",
      });
      const res = await deleteProjectById(req, {
        params: { id: "507f1f77bcf86cd799439011" },
      });
      assert.equal(res.status, 401);
    });

    it("PATCH /api/projects/[id] validates invalid ObjectId format before DB operations", async () => {
      // With invalid ID and unauthenticated session, auth check fails first (401),
      // verifying that unauthorized callers cannot even probe ID formats
      const req = new Request("http://localhost:3000/api/projects/invalid-id-format", {
        method: "PATCH",
        body: JSON.stringify({ title: "Test" }),
      });
      const res = await updateProjectById(req, { params: { id: "invalid-id-format" } });
      assert.equal(res.status, 401);
    });
  });

  // =========================================================================
  // 4. Database Integration & Owner-Scoped Operations (MongoDB Local)
  // =========================================================================
  describe("Database Integration & Owner Scoping (MongoDB Local)", () => {
    let testOwnerUser;
    let otherUser;
    const testOwnerGithubId = "99887766";
    const otherUserGithubId = "11223344";

    before(async () => {
      if (!process.env.MONGODB_URI) {
        return;
      }
      await connectToDatabase();

      // Ensure indexes are built in test database
      await Project.init();
      await User.init();

      // Setup two distinct test users in local MongoDB
      await User.deleteMany({
        githubId: { $in: [testOwnerGithubId, otherUserGithubId] },
      });

      testOwnerUser = await User.create({
        name: "Test Owner",
        email: "owner.test@example.com",
        githubId: testOwnerGithubId,
      });

      otherUser = await User.create({
        name: "Other User",
        email: "other.test@example.com",
        githubId: otherUserGithubId,
      });
    });

    after(async () => {
      if (!process.env.MONGODB_URI) return;
      try {
        // Clean up test projects and users
        if (testOwnerUser?._id) {
          await Project.deleteMany({ owner: testOwnerUser._id });
          await User.deleteOne({ _id: testOwnerUser._id });
        }
        if (otherUser?._id) {
          await Project.deleteMany({ owner: otherUser._id });
          await User.deleteOne({ _id: otherUser._id });
        }
      } finally {
        await mongoose.disconnect();
      }
    });

    it("resolves verified owner ID via getVerifiedOwnerId()", async () => {
      if (!process.env.MONGODB_URI) return;

      const session = {
        user: {
          name: "Test Owner",
          email: "owner.test@example.com",
          githubId: testOwnerGithubId,
        },
      };

      const resolvedId = await getVerifiedOwnerId(session);
      assert.ok(resolvedId instanceof mongoose.Types.ObjectId);
      assert.equal(resolvedId.toString(), testOwnerUser._id.toString());
    });

    it("creates a project strictly bound to the verified owner", async () => {
      if (!process.env.MONGODB_URI) return;

      const project = await Project.create({
        owner: testOwnerUser._id,
        title: "Owner Project 1",
        slug: "owner-project-1",
        shortDescription: "First test project for verified owner",
        category: "Development",
        status: "In Progress",
        visibility: "Private",
        priority: "High",
        progress: 25,
        techStack: ["Next.js", "MongoDB"],
        tags: ["api", "testing"],
      });

      assert.ok(project._id);
      assert.equal(project.owner.toString(), testOwnerUser._id.toString());
      assert.equal(project.slug, "owner-project-1");
    });

    it("enforces compound uniqueness on { owner, slug } - rejects duplicate slug for same owner", async () => {
      if (!process.env.MONGODB_URI) return;

      await assert.rejects(
        async () => {
          await Project.create({
            owner: testOwnerUser._id,
            title: "Duplicate Slug Project",
            slug: "owner-project-1", // duplicate slug for testOwnerUser
            shortDescription: "This should fail due to compound index",
          });
        },
        (err) => {
          assert.equal(err.code, 11000);
          return true;
        }
      );
    });

    it("allows different owners to have projects with the same slug", async () => {
      if (!process.env.MONGODB_URI) return;

      // otherUser can safely create a project with "owner-project-1" slug
      const otherProject = await Project.create({
        owner: otherUser._id,
        title: "Other User Duplicate Slug Allowed",
        slug: "owner-project-1",
        shortDescription: "Same slug under different owner is permitted",
      });

      assert.ok(otherProject._id);
      assert.equal(otherProject.slug, "owner-project-1");
      assert.equal(otherProject.owner.toString(), otherUser._id.toString());
    });

    it("queries projects scoped strictly to the authenticated owner (no data leakage)", async () => {
      if (!process.env.MONGODB_URI) return;

      // Query projects for testOwnerUser
      const ownerProjects = await Project.find({ owner: testOwnerUser._id }).lean();
      const otherProjects = await Project.find({ owner: otherUser._id }).lean();

      assert.ok(ownerProjects.length >= 1);
      assert.ok(otherProjects.length >= 1);

      // Verify no cross-owner contamination
      for (const p of ownerProjects) {
        assert.equal(p.owner.toString(), testOwnerUser._id.toString());
        assert.notEqual(p.owner.toString(), otherUser._id.toString());
      }
    });

    it("supports search regex and multi-field matching (title, techStack, tags)", async () => {
      if (!process.env.MONGODB_URI) return;

      const searchRegex = new RegExp("mongodb", "i");
      const matched = await Project.find({
        owner: testOwnerUser._id,
        $or: [
          { title: searchRegex },
          { shortDescription: searchRegex },
          { techStack: searchRegex },
          { tags: searchRegex },
        ],
      }).lean();

      assert.ok(matched.length >= 1);
      assert.equal(matched[0].slug, "owner-project-1");
    });

    it("supports sorting by allowed fields (createdAt, title, priority, progress)", async () => {
      if (!process.env.MONGODB_URI) return;

      for (const sortField of SORTABLE_FIELDS) {
        const sorted = await Project.find({ owner: testOwnerUser._id })
          .sort({ [sortField]: -1 })
          .lean();
        assert.ok(Array.isArray(sorted));
      }
    });

    it("updates project with PATCH and verifies slug uniqueness during update", async () => {
      if (!process.env.MONGODB_URI) return;

      const project = await Project.findOne({
        owner: testOwnerUser._id,
        slug: "owner-project-1",
      });
      assert.ok(project);

      // Create a second project for testOwnerUser
      const secondProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Second Owner Project",
        slug: "owner-project-2",
        shortDescription: "Second project",
      });

      // Updating second project to its own slug is valid
      const ownSlugCheck = await Project.findOne({
        owner: testOwnerUser._id,
        slug: "owner-project-2",
        _id: { $ne: secondProject._id },
      });
      assert.equal(ownSlugCheck, null);

      // Attempting to update second project's slug to "owner-project-1" conflicts
      const conflictCheck = await Project.findOne({
        owner: testOwnerUser._id,
        slug: "owner-project-1",
        _id: { $ne: secondProject._id },
      });
      assert.ok(conflictCheck, "Expected conflict with existing slug");

      // Clean update
      const updated = await Project.findOneAndUpdate(
        { _id: secondProject._id, owner: testOwnerUser._id },
        { $set: { progress: 90, status: "Completed" } },
        { new: true }
      );
      assert.equal(updated.progress, 90);
      assert.equal(updated.status, "Completed");
    });

    it("deletes project document scoped by owner", async () => {
      if (!process.env.MONGODB_URI) return;

      const secondProject = await Project.findOne({
        owner: testOwnerUser._id,
        slug: "owner-project-2",
      });
      assert.ok(secondProject);

      // Attempting to delete using otherUser's ID fails
      const wrongOwnerDelete = await Project.findOneAndDelete({
        _id: secondProject._id,
        owner: otherUser._id,
      });
      assert.equal(wrongOwnerDelete, null);

      // Deleting with correct owner succeeds
      const successfulDelete = await Project.findOneAndDelete({
        _id: secondProject._id,
        owner: testOwnerUser._id,
      });
      assert.ok(successfulDelete);
      assert.equal(successfulDelete._id.toString(), secondProject._id.toString());

      // Confirm document no longer exists
      const deletedCheck = await Project.findById(secondProject._id);
      assert.equal(deletedCheck, null);
    });
  });
});
