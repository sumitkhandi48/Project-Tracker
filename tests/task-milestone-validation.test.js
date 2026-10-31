import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateTaskPayload,
  TASK_FORBIDDEN_FIELDS,
  TASK_ALLOWED_FIELDS,
  TASK_SORTABLE_FIELDS,
} from "../src/lib/api/task-validation.js";

import {
  validateMilestonePayload,
  MILESTONE_FORBIDDEN_FIELDS,
  MILESTONE_ALLOWED_FIELDS,
  MILESTONE_SORTABLE_FIELDS,
} from "../src/lib/api/milestone-validation.js";

import { TASK_STATUSES, TASK_PRIORITIES } from "../src/models/Task.js";
import { MILESTONE_STATUSES } from "../src/models/Milestone.js";

describe("Phase 4B Task and Milestone Validation Unit Tests", () => {
  // =========================================================================
  // 1. Task Validation Tests
  // =========================================================================
  describe("validateTaskPayload()", () => {
    it("accepts a fully specified valid task create payload", () => {
      const payload = {
        title: "Build auth middleware",
        description: "Implement edge-compatible session checks",
        status: "In Progress",
        priority: "High",
        dueDate: "2026-11-15T00:00:00.000Z",
        completedAt: null,
      };

      const result = validateTaskPayload(payload, false);
      assert.equal(result.isValid, true);
      assert.equal(result.errors.length, 0);
      assert.equal(result.sanitized.title, "Build auth middleware");
      assert.equal(result.sanitized.description, "Implement edge-compatible session checks");
      assert.equal(result.sanitized.status, "In Progress");
      assert.equal(result.sanitized.priority, "High");
      assert.ok(result.sanitized.dueDate instanceof Date);
      assert.equal(result.sanitized.completedAt, null);
    });

    it("accepts a minimal task create payload (title only)", () => {
      const payload = { title: "Simple Task" };
      const result = validateTaskPayload(payload, false);
      assert.equal(result.isValid, true);
      assert.equal(result.sanitized.title, "Simple Task");
    });

    it("accepts a valid partial task update payload (isUpdate = true)", () => {
      const payload = {
        status: "Done",
        completedAt: "2026-10-29T21:00:00.000Z",
      };
      const result = validateTaskPayload(payload, true);
      assert.equal(result.isValid, true);
      assert.equal(result.sanitized.status, "Done");
      assert.ok(result.sanitized.completedAt instanceof Date);
      assert.equal(result.sanitized.title, undefined);
    });

    it("rejects non-object or array request bodies", () => {
      assert.equal(validateTaskPayload(null).isValid, false);
      assert.equal(validateTaskPayload([]).isValid, false);
      assert.equal(validateTaskPayload("string").isValid, false);
      assert.equal(validateTaskPayload(123).isValid, false);
    });

    it("rejects missing, blank, or non-string title on create", () => {
      const missing = validateTaskPayload({});
      assert.equal(missing.isValid, false);
      assert.ok(missing.errors.some((e) => /Title is required/i.test(e)));

      const empty = validateTaskPayload({ title: "   " });
      assert.equal(empty.isValid, false);
      assert.ok(empty.errors.some((e) => /Title is required/i.test(e)));

      const nonString = validateTaskPayload({ title: 12345 });
      assert.equal(nonString.isValid, false);
      assert.ok(nonString.errors.some((e) => /Title is required/i.test(e)));
    });

    it("rejects title exceeding 200 characters", () => {
      const longTitle = validateTaskPayload({ title: "T".repeat(201) });
      assert.equal(longTitle.isValid, false);
      assert.ok(longTitle.errors.some((e) => /cannot exceed 200 characters/i.test(e)));

      const exact200 = validateTaskPayload({ title: "T".repeat(200) });
      assert.equal(exact200.isValid, true);
    });

    it("rejects description exceeding 3000 characters and non-string description", () => {
      const longDesc = validateTaskPayload({
        title: "Valid Title",
        description: "D".repeat(3001),
      });
      assert.equal(longDesc.isValid, false);
      assert.ok(longDesc.errors.some((e) => /cannot exceed 3000 characters/i.test(e)));

      const nonStringDesc = validateTaskPayload({
        title: "Valid Title",
        description: 1234,
      });
      assert.equal(nonStringDesc.isValid, false);
      assert.ok(nonStringDesc.errors.some((e) => /Description must be a string/i.test(e)));
    });

    it("strictly blocks protected fields (owner, project, _id, createdAt, updatedAt, __v)", () => {
      for (const field of TASK_FORBIDDEN_FIELDS) {
        const payload = {
          title: "Legit Task",
          [field]: "forbidden_override_value",
        };
        const result = validateTaskPayload(payload);
        assert.equal(result.isValid, false);
        assert.ok(
          result.errors.some((e) => e.includes(`Modifying protected field '${field}'`)),
          `Expected error for protected field '${field}'`
        );
      }
    });

    it("rejects unsupported arbitrary fields not in TASK_ALLOWED_FIELDS", () => {
      const payload = {
        title: "Legit Task",
        unknownField: "malicious",
        isAdmin: true,
      };
      const result = validateTaskPayload(payload);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes("Unsupported field 'unknownField'")));
      assert.ok(result.errors.some((e) => e.includes("Unsupported field 'isAdmin'")));
    });

    it("validates status enum against TASK_STATUSES (Todo, In Progress, Done)", () => {
      for (const st of TASK_STATUSES) {
        const valid = validateTaskPayload({ title: "Task", status: st });
        assert.equal(valid.isValid, true);
        assert.equal(valid.sanitized.status, st);
      }

      const invalid = validateTaskPayload({ title: "Task", status: "Finished" });
      assert.equal(invalid.isValid, false);
      assert.ok(invalid.errors.some((e) => e.includes("Status must be one of")));
    });

    it("validates priority enum against TASK_PRIORITIES (Low, Medium, High, Critical)", () => {
      for (const pr of TASK_PRIORITIES) {
        const valid = validateTaskPayload({ title: "Task", priority: pr });
        assert.equal(valid.isValid, true);
        assert.equal(valid.sanitized.priority, pr);
      }

      const invalid = validateTaskPayload({ title: "Task", priority: "Urgent" });
      assert.equal(invalid.isValid, false);
      assert.ok(invalid.errors.some((e) => e.includes("Priority must be one of")));
    });

    it("validates dates (dueDate, completedAt) and rejects invalid formats or boolean types", () => {
      // Valid ISO dates
      const valid = validateTaskPayload({
        title: "Task",
        dueDate: "2026-12-01T10:00:00.000Z",
        completedAt: null,
      });
      assert.equal(valid.isValid, true);
      assert.ok(valid.sanitized.dueDate instanceof Date);
      assert.equal(valid.sanitized.completedAt, null);

      // Malformed date strings
      const malformed = validateTaskPayload({
        title: "Task",
        dueDate: "not-a-valid-date",
      });
      assert.equal(malformed.isValid, false);
      assert.ok(malformed.errors.some((e) => /Field 'dueDate' must be a valid date/i.test(e)));

      // Boolean date (new Date(true) vulnerability protection)
      const booleanDate = validateTaskPayload({
        title: "Task",
        dueDate: true,
      });
      assert.equal(booleanDate.isValid, false);
      assert.ok(booleanDate.errors.some((e) => /Field 'dueDate' must be a valid date/i.test(e)));

      // Array date
      const arrayDate = validateTaskPayload({
        title: "Task",
        dueDate: [2026, 12, 1],
      });
      assert.equal(arrayDate.isValid, false);
      assert.ok(arrayDate.errors.some((e) => /Field 'dueDate' must be a valid date/i.test(e)));
    });

    it("handles empty update payload correctly (returns sanitized empty object with no errors)", () => {
      const result = validateTaskPayload({}, true);
      assert.equal(result.isValid, true);
      assert.equal(Object.keys(result.sanitized).length, 0);
    });
  });

  // =========================================================================
  // 2. Milestone Validation Tests
  // =========================================================================
  describe("validateMilestonePayload()", () => {
    it("accepts a fully specified valid milestone create payload", () => {
      const payload = {
        title: "Beta Launch",
        description: "Deploy MVP to staging and test with beta users",
        status: "In Progress",
        targetDate: "2026-11-30T23:59:59.000Z",
        completedAt: null,
      };

      const result = validateMilestonePayload(payload, false);
      assert.equal(result.isValid, true);
      assert.equal(result.errors.length, 0);
      assert.equal(result.sanitized.title, "Beta Launch");
      assert.equal(result.sanitized.description, "Deploy MVP to staging and test with beta users");
      assert.equal(result.sanitized.status, "In Progress");
      assert.ok(result.sanitized.targetDate instanceof Date);
      assert.equal(result.sanitized.completedAt, null);
    });

    it("accepts a minimal milestone create payload (title only)", () => {
      const payload = { title: "Sprint 1" };
      const result = validateMilestonePayload(payload, false);
      assert.equal(result.isValid, true);
      assert.equal(result.sanitized.title, "Sprint 1");
    });

    it("accepts a valid partial milestone update payload (isUpdate = true)", () => {
      const payload = {
        status: "Completed",
        completedAt: "2026-11-01T12:00:00.000Z",
      };
      const result = validateMilestonePayload(payload, true);
      assert.equal(result.isValid, true);
      assert.equal(result.sanitized.status, "Completed");
      assert.ok(result.sanitized.completedAt instanceof Date);
      assert.equal(result.sanitized.title, undefined);
    });

    it("rejects non-object or array request bodies", () => {
      assert.equal(validateMilestonePayload(null).isValid, false);
      assert.equal(validateMilestonePayload([]).isValid, false);
      assert.equal(validateMilestonePayload("string").isValid, false);
    });

    it("rejects missing, blank, or non-string title on create", () => {
      const missing = validateMilestonePayload({});
      assert.equal(missing.isValid, false);
      assert.ok(missing.errors.some((e) => /Title is required/i.test(e)));

      const empty = validateMilestonePayload({ title: "   " });
      assert.equal(empty.isValid, false);
      assert.ok(empty.errors.some((e) => /Title is required/i.test(e)));

      const nonString = validateMilestonePayload({ title: 9876 });
      assert.equal(nonString.isValid, false);
      assert.ok(nonString.errors.some((e) => /Title is required/i.test(e)));
    });

    it("rejects title exceeding 200 characters", () => {
      const longTitle = validateMilestonePayload({ title: "M".repeat(201) });
      assert.equal(longTitle.isValid, false);
      assert.ok(longTitle.errors.some((e) => /cannot exceed 200 characters/i.test(e)));

      const exact200 = validateMilestonePayload({ title: "M".repeat(200) });
      assert.equal(exact200.isValid, true);
    });

    it("rejects description exceeding 3000 characters and non-string description", () => {
      const longDesc = validateMilestonePayload({
        title: "Milestone",
        description: "D".repeat(3001),
      });
      assert.equal(longDesc.isValid, false);
      assert.ok(longDesc.errors.some((e) => /cannot exceed 3000 characters/i.test(e)));

      const nonStringDesc = validateMilestonePayload({
        title: "Milestone",
        description: false,
      });
      assert.equal(nonStringDesc.isValid, false);
      assert.ok(nonStringDesc.errors.some((e) => /Description must be a string/i.test(e)));
    });

    it("strictly blocks protected fields (owner, project, _id, createdAt, updatedAt, __v)", () => {
      for (const field of MILESTONE_FORBIDDEN_FIELDS) {
        const payload = {
          title: "Legit Milestone",
          [field]: "forbidden_override_value",
        };
        const result = validateMilestonePayload(payload);
        assert.equal(result.isValid, false);
        assert.ok(
          result.errors.some((e) => e.includes(`Modifying protected field '${field}'`)),
          `Expected error for protected field '${field}'`
        );
      }
    });

    it("rejects unsupported arbitrary fields not in MILESTONE_ALLOWED_FIELDS", () => {
      const payload = {
        title: "Legit Milestone",
        customMetric: "some-metric",
      };
      const result = validateMilestonePayload(payload);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes("Unsupported field 'customMetric'")));
    });

    it("validates status enum against MILESTONE_STATUSES (Planned, In Progress, Completed)", () => {
      for (const st of MILESTONE_STATUSES) {
        const valid = validateMilestonePayload({ title: "Milestone", status: st });
        assert.equal(valid.isValid, true);
        assert.equal(valid.sanitized.status, st);
      }

      const invalid = validateMilestonePayload({ title: "Milestone", status: "Archived" });
      assert.equal(invalid.isValid, false);
      assert.ok(invalid.errors.some((e) => e.includes("Status must be one of")));
    });

    it("validates dates (targetDate, completedAt) and rejects invalid formats or boolean types", () => {
      // Valid ISO dates
      const valid = validateMilestonePayload({
        title: "Milestone",
        targetDate: "2026-11-20T12:00:00.000Z",
        completedAt: null,
      });
      assert.equal(valid.isValid, true);
      assert.ok(valid.sanitized.targetDate instanceof Date);
      assert.equal(valid.sanitized.completedAt, null);

      // Malformed date strings
      const malformed = validateMilestonePayload({
        title: "Milestone",
        targetDate: "not-a-valid-date",
      });
      assert.equal(malformed.isValid, false);
      assert.ok(malformed.errors.some((e) => /Field 'targetDate' must be a valid date/i.test(e)));

      // Boolean date protection
      const booleanDate = validateMilestonePayload({
        title: "Milestone",
        targetDate: false,
      });
      assert.equal(booleanDate.isValid, false);
      assert.ok(booleanDate.errors.some((e) => /Field 'targetDate' must be a valid date/i.test(e)));

      // Array date protection
      const arrayDate = validateMilestonePayload({
        title: "Milestone",
        targetDate: ["2026-11-20"],
      });
      assert.equal(arrayDate.isValid, false);
      assert.ok(arrayDate.errors.some((e) => /Field 'targetDate' must be a valid date/i.test(e)));
    });

    it("handles empty update payload correctly (returns sanitized empty object with no errors)", () => {
      const result = validateMilestonePayload({}, true);
      assert.equal(result.isValid, true);
      assert.equal(Object.keys(result.sanitized).length, 0);
    });
  });
});
