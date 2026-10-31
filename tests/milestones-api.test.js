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
  GET as getProjectMilestones,
  POST as createProjectMilestone,
} from "../src/app/api/projects/[id]/milestones/route.js";
import {
  GET as getMilestoneById,
  PATCH as updateMilestoneById,
  DELETE as deleteMilestoneById,
} from "../src/app/api/milestones/[id]/route.js";

import { connectToDatabase } from "../src/lib/db/mongodb.js";
import User from "../src/models/User.js";
import Project from "../src/models/Project.js";
import Milestone from "../src/models/Milestone.js";

describe("Phase 4B Milestone API Test Suite", () => {
  const originalEnv = { ...process.env };
  const mockOwnerGithubId = "8877665544";
  const mockOtherGithubId = "2233445566";

  // Mock sessions for route handler unit testing
  const authorizedOwnerSession = {
    user: {
      name: "Verified Owner",
      email: "owner@milestone-tracker.local",
      githubId: mockOwnerGithubId,
    },
  };

  const unauthorizedVisitorSession = {
    user: {
      name: "Non-Owner Visitor",
      email: "visitor@milestone-tracker.local",
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
  // 1. Milestone API Request Validation & Security Boundaries (Offline / Unit Tests)
  // =========================================================================
  describe("Milestone API Request Validation & Security Boundaries (Offline / Unit Tests)", () => {
    const validObjectId = "507f1f77bcf86cd799439011";

    // -----------------------------------------------------------------------
    // Authentication & Authorization Boundaries
    // -----------------------------------------------------------------------
    it("returns 401 when visitor is unauthenticated (no session)", async () => {
      // Project-scoped routes
      const getReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/milestones`);
      const getRes = await getProjectMilestones(getReq, { params: { id: validObjectId } });
      assert.equal(getRes.status, 401);

      const postReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Milestone 1" }),
      });
      const postRes = await createProjectMilestone(postReq, { params: { id: validObjectId } });
      assert.equal(postRes.status, 401);

      // Single-milestone routes
      const getSingleReq = new Request(`http://localhost:3000/api/milestones/${validObjectId}`);
      const getSingleRes = await getMilestoneById(getSingleReq, { params: { id: validObjectId } });
      assert.equal(getSingleRes.status, 401);

      const patchReq = new Request(`http://localhost:3000/api/milestones/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      });
      const patchRes = await updateMilestoneById(patchReq, { params: { id: validObjectId } });
      assert.equal(patchRes.status, 401);

      const deleteReq = new Request(`http://localhost:3000/api/milestones/${validObjectId}`, {
        method: "DELETE",
      });
      const deleteRes = await deleteMilestoneById(deleteReq, { params: { id: validObjectId } });
      assert.equal(deleteRes.status, 401);
    });

    it("returns 403 when authenticated as a non-owner visitor", async () => {
      const getReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/milestones`);
      getReq._testSession = unauthorizedVisitorSession;
      const getRes = await getProjectMilestones(getReq, { params: { id: validObjectId } });
      assert.equal(getRes.status, 403);
      assert.match((await getRes.json()).error, /Owner authorization required/i);

      const postReq = new Request(`http://localhost:3000/api/projects/${validObjectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Milestone 1" }),
      });
      postReq._testSession = unauthorizedVisitorSession;
      const postRes = await createProjectMilestone(postReq, { params: { id: validObjectId } });
      assert.equal(postRes.status, 403);

      const patchReq = new Request(`http://localhost:3000/api/milestones/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      });
      patchReq._testSession = unauthorizedVisitorSession;
      const patchRes = await updateMilestoneById(patchReq, { params: { id: validObjectId } });
      assert.equal(patchRes.status, 403);

      const deleteReq = new Request(`http://localhost:3000/api/milestones/${validObjectId}`, {
        method: "DELETE",
      });
      deleteReq._testSession = unauthorizedVisitorSession;
      const deleteRes = await deleteMilestoneById(deleteReq, { params: { id: validObjectId } });
      assert.equal(deleteRes.status, 403);
    });

    // -----------------------------------------------------------------------
    // ID Validation
    // -----------------------------------------------------------------------
    it("returns 400 for malformed project and milestone IDs", async () => {
      const invalidId = "invalid-not-an-object-id";

      const getReq = new Request(`http://localhost:3000/api/projects/${invalidId}/milestones`);
      getReq._testSession = authorizedOwnerSession;
      const getRes = await getProjectMilestones(getReq, { params: { id: invalidId } });
      assert.equal(getRes.status, 400);
      assert.match((await getRes.json()).error, /Invalid project ID format/i);

      const postReq = new Request(`http://localhost:3000/api/projects/${invalidId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Milestone" }),
      });
      postReq._testSession = authorizedOwnerSession;
      const postRes = await createProjectMilestone(postReq, { params: { id: invalidId } });
      assert.equal(postRes.status, 400);

      const singleGetReq = new Request(`http://localhost:3000/api/milestones/${invalidId}`);
      singleGetReq._testSession = authorizedOwnerSession;
      const singleGetRes = await getMilestoneById(singleGetReq, { params: { id: invalidId } });
      assert.equal(singleGetRes.status, 400);
      assert.match((await singleGetRes.json()).error, /Invalid milestone ID format/i);

      const deleteReq = new Request(`http://localhost:3000/api/milestones/${invalidId}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;
      const deleteRes = await deleteMilestoneById(deleteReq, { params: { id: invalidId } });
      assert.equal(deleteRes.status, 400);
    });

    // -----------------------------------------------------------------------
    // Content-Type & JSON Parsing Enforcement
    // -----------------------------------------------------------------------
    it("returns 415 when Content-Type is missing or not application/json", async () => {
      const reqNoHeader = new Request(
        `http://localhost:3000/api/projects/${validObjectId}/milestones`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Milestone" }),
        }
      );
      reqNoHeader._testSession = authorizedOwnerSession;
      const resNoHeader = await createProjectMilestone(reqNoHeader, {
        params: { id: validObjectId },
      });
      assert.equal(resNoHeader.status, 415);
      assert.match((await resNoHeader.json()).error, /Content-Type must be application\/json/i);

      const reqTextPlain = new Request(`http://localhost:3000/api/milestones/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ status: "Completed" }),
      });
      reqTextPlain._testSession = authorizedOwnerSession;
      const resTextPlain = await updateMilestoneById(reqTextPlain, {
        params: { id: validObjectId },
      });
      assert.equal(resTextPlain.status, 415);
    });

    it("returns 400 when request body contains malformed JSON", async () => {
      const req = new Request(
        `http://localhost:3000/api/projects/${validObjectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ broken json...",
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectMilestone(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /Malformed JSON/i);
    });

    // -----------------------------------------------------------------------
    // Payload Validation (Protected Fields, Enums, Types)
    // -----------------------------------------------------------------------
    it("returns 400 when client attempts mass assignment on protected fields (owner, project, _id)", async () => {
      const protectedFields = ["owner", "project", "_id", "createdAt", "updatedAt", "__v"];
      for (const field of protectedFields) {
        const req = new Request(
          `http://localhost:3000/api/projects/${validObjectId}/milestones`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "Milestone with protected field",
              [field]: "malicious_override",
            }),
          }
        );
        req._testSession = authorizedOwnerSession;
        const res = await createProjectMilestone(req, { params: { id: validObjectId } });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.ok(
          data.errors.some((e) => e.includes(`Modifying protected field '${field}'`)),
          `Expected error for protected field '${field}'`
        );
      }
    });

    it("returns 400 when client supplies unsupported arbitrary fields", async () => {
      const req = new Request(
        `http://localhost:3000/api/projects/${validObjectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Legit Milestone",
            unexpectedField: "hack",
          }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectMilestone(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.errors.some((e) => e.includes("Unsupported field 'unexpectedField'")));
    });

    it("returns 400 when PATCH body has no valid mutable fields", async () => {
      const req = new Request(`http://localhost:3000/api/milestones/${validObjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      req._testSession = authorizedOwnerSession;
      const res = await updateMilestoneById(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /No valid fields provided for update/i);
    });

    it("returns 400 when invalid status enum is provided", async () => {
      const req = new Request(
        `http://localhost:3000/api/projects/${validObjectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Milestone with bad status",
            status: "InvalidMilestoneStatus",
          }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectMilestone(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.errors.some((e) => e.includes("Status must be one of")));
    });

    it("returns 400 when invalid date format is provided", async () => {
      const req = new Request(
        `http://localhost:3000/api/projects/${validObjectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Milestone with bad date",
            targetDate: "invalid-date-string",
          }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectMilestone(req, { params: { id: validObjectId } });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.errors.some((e) => /must be a valid date/i.test(e)));
    });
  });

  // =========================================================================
  // 2. Milestone API End-to-End Integration & Multi-Tenant Isolation (Live MongoDB)
  // =========================================================================
  describe("Milestone API End-to-End Integration & Multi-Tenant Isolation (Live MongoDB)", () => {
    let testOwnerUser;
    let otherUser;
    let ownerProject;
    let otherProject;

    before(async () => {
      if (!process.env.MONGODB_URI) return;

      await connectToDatabase();
      await Milestone.init();
      await Project.init();
      await User.init();

      // Clean existing fixtures for these test IDs
      await User.deleteMany({
        githubId: { $in: [mockOwnerGithubId, mockOtherGithubId] },
      });

      testOwnerUser = await User.create({
        name: "Test Owner",
        email: "owner.milestonetest@example.com",
        githubId: mockOwnerGithubId,
      });

      otherUser = await User.create({
        name: "Other User",
        email: "other.milestonetest@example.com",
        githubId: mockOtherGithubId,
      });

      ownerProject = await Project.create({
        owner: testOwnerUser._id,
        title: "Owner Milestone Project",
        slug: "owner-milestone-project",
        shortDescription: "Project for testing milestones API",
      });

      otherProject = await Project.create({
        owner: otherUser._id,
        title: "Other User Milestone Project",
        slug: "other-user-milestone-project",
        shortDescription: "Other user's project for testing milestone isolation",
      });
    });

    after(async () => {
      if (!process.env.MONGODB_URI) return;
      try {
        if (testOwnerUser?._id) {
          await Milestone.deleteMany({ owner: testOwnerUser._id });
          await Project.deleteMany({ owner: testOwnerUser._id });
          await User.deleteOne({ _id: testOwnerUser._id });
        }
        if (otherUser?._id) {
          await Milestone.deleteMany({ owner: otherUser._id });
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
    it("returns 404 when attempting to create a milestone in a non-existent project", async () => {
      if (!process.env.MONGODB_URI) return;

      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const req = new Request(
        `http://localhost:3000/api/projects/${nonExistentId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Orphan Milestone" }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectMilestone(req, { params: { id: nonExistentId } });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);
    });

    it("returns 404 when attempting to create a milestone in another owner's project (IDOR prevention)", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${otherProject._id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Injected Milestone" }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectMilestone(req, {
        params: { id: otherProject._id.toString() },
      });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Project not found/i);
    });

    // -----------------------------------------------------------------------
    // Milestone Creation & Server-Bound Relationship Integrity
    // -----------------------------------------------------------------------
    it("creates a milestone bound strictly to the verified owner and verified parent project", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${ownerProject._id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Alpha Release v0.1",
            description: "First runnable version deployed to staging",
            status: "In Progress",
            targetDate: "2026-11-30T00:00:00.000Z",
          }),
        }
      );
      req._testSession = authorizedOwnerSession;
      const res = await createProjectMilestone(req, {
        params: { id: ownerProject._id.toString() },
      });
      assert.equal(res.status, 201);

      const data = await res.json();
      assert.ok(data.milestone._id);
      assert.equal(data.milestone.title, "Alpha Release v0.1");
      assert.equal(data.milestone.owner.toString(), testOwnerUser._id.toString());
      assert.equal(data.milestone.project.toString(), ownerProject._id.toString());
      assert.equal(data.milestone.status, "In Progress");
      assert.equal(data.milestone.completedAt, null);
    });

    // -----------------------------------------------------------------------
    // Milestone Listing & Query Scoping
    // -----------------------------------------------------------------------
    it("lists only milestones belonging to the specified project and authenticated owner", async () => {
      if (!process.env.MONGODB_URI) return;

      // Seed a milestone directly under otherProject
      await Milestone.create({
        owner: otherUser._id,
        project: otherProject._id,
        title: "Other User Secret Milestone",
      });

      const req = new Request(
        `http://localhost:3000/api/projects/${ownerProject._id}/milestones?status=In Progress`
      );
      req._testSession = authorizedOwnerSession;
      const res = await getProjectMilestones(req, {
        params: { id: ownerProject._id.toString() },
      });
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.ok(Array.isArray(data.milestones));
      assert.ok(data.milestones.length >= 1);
      assert.ok(data.pagination);

      // Verify no milestone from otherUser appears
      for (const m of data.milestones) {
        assert.equal(m.owner.toString(), testOwnerUser._id.toString());
        assert.equal(m.project.toString(), ownerProject._id.toString());
        assert.equal(m.status, "In Progress");
      }
    });

    it("returns 404 when listing milestones for another owner's project", async () => {
      if (!process.env.MONGODB_URI) return;

      const req = new Request(
        `http://localhost:3000/api/projects/${otherProject._id}/milestones`
      );
      req._testSession = authorizedOwnerSession;
      const res = await getProjectMilestones(req, {
        params: { id: otherProject._id.toString() },
      });
      assert.equal(res.status, 404);
    });

    // -----------------------------------------------------------------------
    // Single Milestone Retrieval
    // -----------------------------------------------------------------------
    it("retrieves a single milestone belonging to the authenticated owner", async () => {
      if (!process.env.MONGODB_URI) return;

      const milestone = await Milestone.findOne({
        owner: testOwnerUser._id,
        project: ownerProject._id,
      });
      assert.ok(milestone);

      const req = new Request(`http://localhost:3000/api/milestones/${milestone._id}`);
      req._testSession = authorizedOwnerSession;
      const res = await getMilestoneById(req, {
        params: { id: milestone._id.toString() },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.milestone._id.toString(), milestone._id.toString());
    });

    it("returns 404 when retrieving a non-existent milestone or another owner's milestone", async () => {
      if (!process.env.MONGODB_URI) return;

      const otherMilestone = await Milestone.findOne({ owner: otherUser._id });
      assert.ok(otherMilestone);

      // Owner trying to read otherUser's milestone
      const req = new Request(`http://localhost:3000/api/milestones/${otherMilestone._id}`);
      req._testSession = authorizedOwnerSession;
      const res = await getMilestoneById(req, {
        params: { id: otherMilestone._id.toString() },
      });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /Milestone not found/i);
    });

    // -----------------------------------------------------------------------
    // Completion Timestamp Transitions & Partial Updates (PATCH)
    // -----------------------------------------------------------------------
    it("auto-populates completedAt when milestone is marked 'Completed'", async () => {
      if (!process.env.MONGODB_URI) return;

      const milestone = await Milestone.findOne({
        owner: testOwnerUser._id,
        project: ownerProject._id,
        status: { $ne: "Completed" },
      });
      assert.ok(milestone);
      assert.equal(milestone.completedAt, null);

      const patchReq = new Request(`http://localhost:3000/api/milestones/${milestone._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateMilestoneById(patchReq, {
        params: { id: milestone._id.toString() },
      });
      assert.equal(patchRes.status, 200);

      const data = await patchRes.json();
      assert.equal(data.milestone.status, "Completed");
      assert.ok(data.milestone.completedAt, "Expected completedAt to be auto-populated");
      assert.ok(new Date(data.milestone.completedAt) <= new Date());
    });

    it("preserves existing completedAt on unrelated updates when milestone remains 'Completed'", async () => {
      if (!process.env.MONGODB_URI) return;

      const milestone = await Milestone.findOne({
        owner: testOwnerUser._id,
        status: "Completed",
      });
      assert.ok(milestone);
      const originalCompletedAt = milestone.completedAt.toISOString();

      const patchReq = new Request(`http://localhost:3000/api/milestones/${milestone._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated description for completed milestone" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateMilestoneById(patchReq, {
        params: { id: milestone._id.toString() },
      });
      assert.equal(patchRes.status, 200);

      const data = await patchRes.json();
      assert.equal(data.milestone.status, "Completed");
      assert.equal(data.milestone.description, "Updated description for completed milestone");
      assert.equal(
        new Date(data.milestone.completedAt).toISOString(),
        originalCompletedAt,
        "completedAt must not be altered by unrelated field update"
      );
    });

    it("clears completedAt when milestone transitions from 'Completed' back to 'Planned'", async () => {
      if (!process.env.MONGODB_URI) return;

      const milestone = await Milestone.findOne({
        owner: testOwnerUser._id,
        status: "Completed",
      });
      assert.ok(milestone);

      const patchReq = new Request(`http://localhost:3000/api/milestones/${milestone._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Planned" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateMilestoneById(patchReq, {
        params: { id: milestone._id.toString() },
      });
      assert.equal(patchRes.status, 200);

      const data = await patchRes.json();
      assert.equal(data.milestone.status, "Planned");
      assert.equal(data.milestone.completedAt, null, "completedAt must be cleared when leaving Completed");
    });

    it("returns 404 when attempting to PATCH another owner's milestone", async () => {
      if (!process.env.MONGODB_URI) return;

      const otherMilestone = await Milestone.findOne({ owner: otherUser._id });
      assert.ok(otherMilestone);

      const patchReq = new Request(`http://localhost:3000/api/milestones/${otherMilestone._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Tampered Milestone Title" }),
      });
      patchReq._testSession = authorizedOwnerSession;
      const patchRes = await updateMilestoneById(patchReq, {
        params: { id: otherMilestone._id.toString() },
      });
      assert.equal(patchRes.status, 404);
      assert.match((await patchRes.json()).error, /Milestone not found/i);
    });

    // -----------------------------------------------------------------------
    // Milestone Deletion & Isolation (DELETE)
    // -----------------------------------------------------------------------
    it("returns 404 when attempting to DELETE another owner's milestone", async () => {
      if (!process.env.MONGODB_URI) return;

      const otherMilestone = await Milestone.findOne({ owner: otherUser._id });
      assert.ok(otherMilestone);

      const deleteReq = new Request(`http://localhost:3000/api/milestones/${otherMilestone._id}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;
      const deleteRes = await deleteMilestoneById(deleteReq, {
        params: { id: otherMilestone._id.toString() },
      });
      assert.equal(deleteRes.status, 404);
      assert.match((await deleteRes.json()).error, /Milestone not found/i);

      // Confirm otherUser's milestone still exists in DB
      const checkOtherMilestone = await Milestone.findById(otherMilestone._id);
      assert.ok(checkOtherMilestone);
    });

    it("deletes a milestone owned by the authenticated owner", async () => {
      if (!process.env.MONGODB_URI) return;

      const milestone = await Milestone.findOne({
        owner: testOwnerUser._id,
        project: ownerProject._id,
      });
      assert.ok(milestone);

      const deleteReq = new Request(`http://localhost:3000/api/milestones/${milestone._id}`, {
        method: "DELETE",
      });
      deleteReq._testSession = authorizedOwnerSession;
      const deleteRes = await deleteMilestoneById(deleteReq, {
        params: { id: milestone._id.toString() },
      });
      assert.equal(deleteRes.status, 200);

      const data = await deleteRes.json();
      assert.match(data.message, /Milestone deleted successfully/i);
      assert.equal(data.deletedId, milestone._id.toString());

      // Confirm document no longer exists
      const checkDeleted = await Milestone.findById(milestone._id);
      assert.equal(checkDeleted, null);
    });
  });
});
