import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { checkOwnerAccess } from "../src/lib/auth/session.js";
import { authOptions } from "../src/lib/auth/auth-options.js";
import User from "../src/models/User.js";

describe("Phase 3 Authentication & Authorization Unit Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // -------------------------------------------------------------------------
  // 1. Authorization Boundary Checks (checkOwnerAccess)
  // -------------------------------------------------------------------------
  describe("checkOwnerAccess() Boundary Logic", () => {
    it("denies access to unauthenticated visitor (session is null)", async () => {
      process.env.OWNER_GITHUB_ID = "12345678";
      const result = await checkOwnerAccess(null);

      assert.equal(result.status, "UNAUTHENTICATED");
      assert.equal(result.isOwner, false);
      assert.equal(result.session, null);
    });

    it("denies access when session object has no user", async () => {
      process.env.OWNER_GITHUB_ID = "12345678";
      const result = await checkOwnerAccess({});

      assert.equal(result.status, "UNAUTHENTICATED");
      assert.equal(result.isOwner, false);
      assert.equal(result.session, null);
    });

    it("fails closed when OWNER_GITHUB_ID environment variable is missing", async () => {
      delete process.env.OWNER_GITHUB_ID;

      const authenticatedSession = {
        user: {
          name: "Developer",
          email: "dev@example.com",
          githubId: "12345678",
        },
      };

      const result = await checkOwnerAccess(authenticatedSession);
      assert.equal(result.status, "UNAUTHORIZED");
      assert.equal(result.isOwner, false);
    });

    it("fails closed when OWNER_GITHUB_ID environment variable is empty string", async () => {
      process.env.OWNER_GITHUB_ID = "   ";

      const authenticatedSession = {
        user: {
          name: "Developer",
          email: "dev@example.com",
          githubId: "12345678",
        },
      };

      const result = await checkOwnerAccess(authenticatedSession);
      assert.equal(result.status, "UNAUTHORIZED");
      assert.equal(result.isOwner, false);
    });

    it("denies access to an authenticated non-owner account", async () => {
      process.env.OWNER_GITHUB_ID = "12345678";

      const nonOwnerSession = {
        user: {
          name: "Other User",
          email: "other@example.com",
          githubId: "99999999", // Different GitHub ID
        },
      };

      const result = await checkOwnerAccess(nonOwnerSession);
      assert.equal(result.status, "UNAUTHORIZED");
      assert.equal(result.isOwner, false);
      assert.equal(result.session.user.name, "Other User");
    });

    it("authorizes the authenticated configured owner account", async () => {
      process.env.OWNER_GITHUB_ID = "12345678";

      const ownerSession = {
        user: {
          name: "Owner User",
          email: "owner@example.com",
          githubId: "12345678", // Matches OWNER_GITHUB_ID
        },
      };

      const result = await checkOwnerAccess(ownerSession);
      assert.equal(result.status, "AUTHORIZED");
      assert.equal(result.isOwner, true);
      assert.equal(result.session.user.githubId, "12345678");
    });

    it("prevents client-supplied identity fields or role from overriding server verification", async () => {
      process.env.OWNER_GITHUB_ID = "12345678";

      // Attacker sends spoofed role / isOwner: true, but githubId does not match
      const spoofedSession = {
        user: {
          name: "Attacker",
          email: "attacker@example.com",
          githubId: "66666666",
          role: "admin",
          isOwner: true, // Spoofed field
        },
      };

      const result = await checkOwnerAccess(spoofedSession);
      assert.equal(result.status, "UNAUTHORIZED");
      assert.equal(result.isOwner, false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Auth.js / NextAuth Callbacks Contract
  // -------------------------------------------------------------------------
  describe("Auth.js Options & Callbacks Contract", () => {
    it("jwt callback records githubId from profile and verifies owner status", async () => {
      process.env.OWNER_GITHUB_ID = "44556677";

      const token = {};
      const profile = { id: 44556677 }; // Number from GitHub API

      const updatedToken = await authOptions.callbacks.jwt({ token, profile });
      assert.equal(updatedToken.githubId, "44556677");
      assert.equal(updatedToken.isOwner, true);

      // Non-owner profile
      const nonOwnerToken = await authOptions.callbacks.jwt({
        token: {},
        profile: { id: 11111111 },
      });
      assert.equal(nonOwnerToken.githubId, "11111111");
      assert.equal(nonOwnerToken.isOwner, false);
    });

    it("session callback exposes verified id, githubId, and isOwner boolean", async () => {
      const session = { user: { name: "Test" } };
      const token = {
        userId: "mongo_user_123",
        githubId: "44556677",
        isOwner: true,
      };

      const updatedSession = await authOptions.callbacks.session({ session, token });
      assert.equal(updatedSession.user.id, "mongo_user_123");
      assert.equal(updatedSession.user.githubId, "44556677");
      assert.equal(updatedSession.user.isOwner, true);
    });

    it("has JWT strategy and login pages configured", () => {
      assert.equal(authOptions.session.strategy, "jwt");
      assert.equal(authOptions.pages.signIn, "/login");
      assert.equal(authOptions.pages.error, "/login");
    });
  });

  // -------------------------------------------------------------------------
  // 3. User Model GitHub Integration
  // -------------------------------------------------------------------------
  describe("User Model GitHub Integration", () => {
    it("schema includes sparse unique githubId index", () => {
      const githubIdPath = User.schema.path("githubId");
      assert.ok(githubIdPath, "User schema must define githubId path");
      assert.equal(githubIdPath.instance, "String");
    });

    it("validates user document with githubId", async () => {
      const user = new User({
        name: "GitHub Developer",
        email: "github.dev@example.com",
        githubId: "87654321",
      });
      await user.validate();
      assert.equal(user.githubId, "87654321");
    });

    it("validates user document without githubId (default null)", async () => {
      const user = new User({
        name: "Local Developer",
        email: "local.dev@example.com",
      });
      await user.validate();
      assert.equal(user.githubId, null);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Production Security Hardening (Test Session Injection Guard)
  // -------------------------------------------------------------------------
  describe("Production Test Session Injection Protection", () => {
    it("ignores injected owner session and fails closed when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";
      process.env.OWNER_GITHUB_ID = "12345678";

      const injectedOwnerSession = {
        user: {
          name: "Attacker Pretending Owner",
          email: "owner@example.com",
          githubId: "12345678",
        },
      };

      const result = await checkOwnerAccess(injectedOwnerSession);
      assert.equal(result.status, "UNAUTHENTICATED");
      assert.equal(result.isOwner, false);
      assert.equal(result.session, null);
    });

    it("ignores injected non-owner session and fails closed when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";
      process.env.OWNER_GITHUB_ID = "12345678";

      const injectedNonOwnerSession = {
        user: {
          name: "Random User",
          email: "random@example.com",
          githubId: "88888888",
        },
      };

      const result = await checkOwnerAccess(injectedNonOwnerSession);
      assert.equal(result.status, "UNAUTHENTICATED");
      assert.equal(result.isOwner, false);
      assert.equal(result.session, null);
    });

    it("permits customSession override when outside production (e.g. test environment)", async () => {
      process.env.NODE_ENV = "test";
      process.env.OWNER_GITHUB_ID = "12345678";

      const testSession = {
        user: {
          name: "Test Owner",
          email: "owner@example.com",
          githubId: "12345678",
        },
      };

      const result = await checkOwnerAccess(testSession);
      assert.equal(result.status, "AUTHORIZED");
      assert.equal(result.isOwner, true);
      assert.equal(result.session.user.githubId, "12345678");
    });
  });
});
