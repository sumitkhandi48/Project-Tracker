import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Task from "../src/models/Task.js";
import Milestone from "../src/models/Milestone.js";
import Activity from "../src/models/Activity.js";
import { connectToDatabase } from "../src/lib/db/mongodb.js";

const mockUserId = new mongoose.Types.ObjectId();
const mockProjectId = new mongoose.Types.ObjectId();

describe("Mongoose Models Schema Validation (Offline / Unit Tests)", () => {
  // -------------------------------------------------------------
  // User Model
  // -------------------------------------------------------------
  describe("User Model", () => {
    it("fails validation when required fields (name, email) are missing", async () => {
      const user = new User({});
      await assert.rejects(
        async () => await user.validate(),
        (err) => {
          assert.ok(err.errors.name, "Expected name error");
          assert.ok(err.errors.email, "Expected email error");
          return true;
        }
      );
    });

    it("normalizes email to lowercase and trims whitespace", () => {
      const user = new User({
        name: "Developer Name",
        email: "  Alex.Dev@Example.COM  ",
      });
      assert.equal(user.email, "alex.dev@example.com");
    });

    it("rejects invalid email formats", async () => {
      const user = new User({
        name: "Test User",
        email: "not-an-email",
      });
      await assert.rejects(
        async () => await user.validate(),
        (err) => {
          assert.ok(err.errors.email, "Expected invalid email format error");
          return true;
        }
      );
    });

    it("accepts valid image URLs and rejects malformed image URLs", async () => {
      const validUser = new User({
        name: "Test User",
        email: "test@example.com",
        image: "https://example.com/avatar.png",
      });
      await validUser.validate();

      const invalidUser = new User({
        name: "Test User",
        email: "test@example.com",
        image: "ftp://invalid-url.com/pic.jpg",
      });
      await assert.rejects(
        async () => await invalidUser.validate(),
        (err) => {
          assert.ok(err.errors.image, "Expected invalid image URL error");
          return true;
        }
      );
    });

    it("has timestamps configured on schema", () => {
      assert.ok(User.schema.options.timestamps, "Schema should have timestamps enabled");
    });
  });

  // -------------------------------------------------------------
  // Project Model
  // -------------------------------------------------------------
  describe("Project Model", () => {
    it("fails validation when required fields are missing", async () => {
      const project = new Project({});
      await assert.rejects(
        async () => await project.validate(),
        (err) => {
          assert.ok(err.errors.owner, "Expected owner error");
          assert.ok(err.errors.title, "Expected title error");
          assert.ok(err.errors.slug, "Expected slug error");
          assert.ok(err.errors.shortDescription, "Expected shortDescription error");
          return true;
        }
      );
    });

    it("rejects invalid slug format and normalizes slug to lowercase", async () => {
      const invalidSlugProject = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "Invalid Slug With Spaces!",
        shortDescription: "Short description",
      });
      await assert.rejects(
        async () => await invalidSlugProject.validate(),
        (err) => {
          assert.ok(err.errors.slug, "Expected slug format error");
          return true;
        }
      );

      const validSlugProject = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "Valid-Slug-123",
        shortDescription: "Short description",
      });
      assert.equal(validSlugProject.slug, "valid-slug-123");
    });

    it("validates progress bounds: default is 0, rejects < 0 and > 100", async () => {
      const defaultProject = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "test-project",
        shortDescription: "Short description",
      });
      assert.equal(defaultProject.progress, 0);

      const negativeProgress = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "test-project",
        shortDescription: "Short description",
        progress: -5,
      });
      await assert.rejects(
        async () => await negativeProgress.validate(),
        (err) => {
          assert.ok(err.errors.progress, "Expected negative progress error");
          return true;
        }
      );

      const excessiveProgress = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "test-project",
        shortDescription: "Short description",
        progress: 105,
      });
      await assert.rejects(
        async () => await excessiveProgress.validate(),
        (err) => {
          assert.ok(err.errors.progress, "Expected excessive progress error");
          return true;
        }
      );
    });

    it("validates enum fields (status, visibility, priority)", async () => {
      const invalidEnumProject = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "test-project",
        shortDescription: "Short description",
        status: "Archived_Unknown",
        visibility: "Secret",
        priority: "Urgent",
      });
      await assert.rejects(
        async () => await invalidEnumProject.validate(),
        (err) => {
          assert.ok(err.errors.status, "Expected status enum error");
          assert.ok(err.errors.visibility, "Expected visibility enum error");
          assert.ok(err.errors.priority, "Expected priority enum error");
          return true;
        }
      );

      const validEnumProject = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "test-project",
        shortDescription: "Short description",
        status: "In Progress",
        visibility: "Public",
        priority: "Critical",
      });
      await validEnumProject.validate();
      assert.equal(validEnumProject.status, "In Progress");
      assert.equal(validEnumProject.visibility, "Public");
      assert.equal(validEnumProject.priority, "Critical");
    });

    it("validates repository, demo, live, and docs URLs", async () => {
      const invalidUrlProject = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "test-project",
        shortDescription: "Short description",
        repositoryUrl: "git@github.com:invalid/ssh",
        liveUrl: "not-a-valid-http-url",
      });
      await assert.rejects(
        async () => await invalidUrlProject.validate(),
        (err) => {
          assert.ok(err.errors.repositoryUrl, "Expected repositoryUrl validation error");
          assert.ok(err.errors.liveUrl, "Expected liveUrl validation error");
          return true;
        }
      );

      const validUrlProject = new Project({
        owner: mockUserId,
        title: "Test Project",
        slug: "test-project",
        shortDescription: "Short description",
        repositoryUrl: "https://github.com/sumitkhandi48/Project-Tracker",
        liveUrl: "https://tracker.dev",
      });
      await validUrlProject.validate();
    });

    it("verifies compound unique index on { owner: 1, slug: 1 } exists in schema", () => {
      const indexes = Project.schema.indexes();
      const compoundSlugIndex = indexes.find(
        ([fields, options]) => fields.owner === 1 && fields.slug === 1 && options?.unique === true
      );
      assert.ok(compoundSlugIndex, "Compound unique index on { owner: 1, slug: 1 } must be declared");
    });
  });

  // -------------------------------------------------------------
  // Task Model
  // -------------------------------------------------------------
  describe("Task Model", () => {
    it("fails validation when project, owner, or title is missing", async () => {
      const task = new Task({});
      await assert.rejects(
        async () => await task.validate(),
        (err) => {
          assert.ok(err.errors.project, "Expected project error");
          assert.ok(err.errors.owner, "Expected owner error");
          assert.ok(err.errors.title, "Expected title error");
          return true;
        }
      );
    });

    it("has defaults: status 'Todo' and priority 'Medium'", () => {
      const task = new Task({
        project: mockProjectId,
        owner: mockUserId,
        title: "Implement feature",
      });
      assert.equal(task.status, "Todo");
      assert.equal(task.priority, "Medium");
    });

    it("validates task status enum (accepts Todo, In Progress, Done; rejects invalid)", async () => {
      const invalidTask = new Task({
        project: mockProjectId,
        owner: mockUserId,
        title: "Test task",
        status: "Finished",
      });
      await assert.rejects(
        async () => await invalidTask.validate(),
        (err) => {
          assert.ok(err.errors.status, "Expected status enum error");
          return true;
        }
      );

      const validTask = new Task({
        project: mockProjectId,
        owner: mockUserId,
        title: "Test task",
        status: "In Progress",
      });
      await validTask.validate();
      assert.equal(validTask.status, "In Progress");
    });

    it("verifies index on { project: 1, status: 1 } exists", () => {
      const indexes = Task.schema.indexes();
      const statusIndex = indexes.find(
        ([fields]) => fields.project === 1 && fields.status === 1
      );
      assert.ok(statusIndex, "Index on { project: 1, status: 1 } must be declared");
    });
  });

  // -------------------------------------------------------------
  // Milestone Model
  // -------------------------------------------------------------
  describe("Milestone Model", () => {
    it("fails validation when project, owner, or title is missing", async () => {
      const milestone = new Milestone({});
      await assert.rejects(
        async () => await milestone.validate(),
        (err) => {
          assert.ok(err.errors.project, "Expected project error");
          assert.ok(err.errors.owner, "Expected owner error");
          assert.ok(err.errors.title, "Expected title error");
          return true;
        }
      );
    });

    it("defaults status to 'Planned' and rejects invalid status enum", async () => {
      const milestone = new Milestone({
        project: mockProjectId,
        owner: mockUserId,
        title: "Sprint 1 Delivery",
      });
      assert.equal(milestone.status, "Planned");

      const invalidMilestone = new Milestone({
        project: mockProjectId,
        owner: mockUserId,
        title: "Sprint 1",
        status: "Delayed",
      });
      await assert.rejects(
        async () => await invalidMilestone.validate(),
        (err) => {
          assert.ok(err.errors.status, "Expected status enum error");
          return true;
        }
      );
    });

    it("verifies index on { project: 1, targetDate: 1 } exists", () => {
      const indexes = Milestone.schema.indexes();
      const targetDateIndex = indexes.find(
        ([fields]) => fields.project === 1 && fields.targetDate === 1
      );
      assert.ok(targetDateIndex, "Index on { project: 1, targetDate: 1 } must be declared");
    });
  });

  // -------------------------------------------------------------
  // Activity Model
  // -------------------------------------------------------------
  describe("Activity Model", () => {
    it("fails validation when owner, type, or message is missing", async () => {
      const activity = new Activity({});
      await assert.rejects(
        async () => await activity.validate(),
        (err) => {
          assert.ok(err.errors.owner, "Expected owner error");
          assert.ok(err.errors.type, "Expected type error");
          assert.ok(err.errors.message, "Expected message error");
          return true;
        }
      );
    });

    it("allows optional project reference (null by default)", async () => {
      const activity = new Activity({
        owner: mockUserId,
        type: "project_created",
        message: "Created new project",
      });
      await activity.validate();
      assert.equal(activity.project, null);
    });

    it("validates activity type enum", async () => {
      const invalidActivity = new Activity({
        owner: mockUserId,
        type: "unknown_custom_event",
        message: "Something happened",
      });
      await assert.rejects(
        async () => await invalidActivity.validate(),
        (err) => {
          assert.ok(err.errors.type, "Expected type enum error");
          return true;
        }
      );

      const validActivity = new Activity({
        owner: mockUserId,
        type: "task_completed",
        message: "Completed task PRJ-01",
        metadata: { taskId: "task-123", timeSpentMs: 3600000 },
      });
      await validActivity.validate();
      assert.equal(validActivity.metadata.taskId, "task-123");
    });

    it("verifies indexes on { owner: 1, createdAt: -1 } and { project: 1, createdAt: -1 }", () => {
      const indexes = Activity.schema.indexes();
      const ownerActivityIndex = indexes.find(
        ([fields]) => fields.owner === 1 && fields.createdAt === -1
      );
      const projectActivityIndex = indexes.find(
        ([fields]) => fields.project === 1 && fields.createdAt === -1
      );
      assert.ok(ownerActivityIndex, "Index on { owner: 1, createdAt: -1 } must be declared");
      assert.ok(projectActivityIndex, "Index on { project: 1, createdAt: -1 } must be declared");
    });
  });

  // -------------------------------------------------------------
  // Hot-Reload & Connection Helper Safety
  // -------------------------------------------------------------
  describe("Hot Reload & Helper Safety", () => {
    it("re-evaluating model definitions does not throw Mongoose OverwriteModelError", () => {
      assert.doesNotThrow(() => {
        const reUser = mongoose.models.User || mongoose.model("User", User.schema);
        const reProject = mongoose.models.Project || mongoose.model("Project", Project.schema);
        assert.ok(reUser);
        assert.ok(reProject);
      });
    });

    it("connectToDatabase throws clear error if MONGODB_URI is unset", async () => {
      const originalUri = process.env.MONGODB_URI;
      delete process.env.MONGODB_URI;

      try {
        await assert.rejects(
          async () => await connectToDatabase(),
          /Missing MONGODB_URI environment variable/
        );
      } finally {
        if (originalUri !== undefined) {
          process.env.MONGODB_URI = originalUri;
        }
      }
    });
  });
});
