import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-options.js";

/**
 * Retrieves the verified server-side session.
 * Safe to call in Server Components, Route Handlers, and Server Actions.
 */
export async function getAuthSession() {
  try {
    return await getServerSession(authOptions);
  } catch {
    // If called outside Next.js request context (e.g. standalone test or static build), fail closed with null session
    return null;
  }
}

/**
 * Evaluates the authorization boundary for the current session.
 * Distinguishes three explicit states:
 * 1. UNAUTHENTICATED: No session found.
 * 2. UNAUTHORIZED: Authenticated with GitHub, but account ID does not match OWNER_GITHUB_ID (or owner ID not configured).
 * 3. AUTHORIZED: Authenticated account verified as the configured owner.
 *
 * @param {object|null} [customSession] Optional pre-retrieved session. If undefined, fetches current server session.
 * @returns {Promise<{ status: 'UNAUTHENTICATED' | 'UNAUTHORIZED' | 'AUTHORIZED', isOwner: boolean, session: object | null }>}
 */
export async function checkOwnerAccess(customSession = undefined) {
  // In production, reject test session injection and strictly enforce verified session retrieval
  const isTestOverrideAllowed = process.env.NODE_ENV !== "production";
  const session =
    isTestOverrideAllowed && customSession !== undefined
      ? customSession
      : await getAuthSession();

  if (!session || !session.user) {
    return {
      status: "UNAUTHENTICATED",
      isOwner: false,
      session: null,
    };
  }

  const ownerId = process.env.OWNER_GITHUB_ID ? process.env.OWNER_GITHUB_ID.trim() : null;
  const userGithubId = session.user.githubId ? String(session.user.githubId).trim() : null;

  // Fail closed: if OWNER_GITHUB_ID is missing or does not match, deny access
  if (!ownerId || !userGithubId || userGithubId !== ownerId) {
    return {
      status: "UNAUTHORIZED",
      isOwner: false,
      session,
    };
  }

  return {
    status: "AUTHORIZED",
    isOwner: true,
    session,
  };
}

export default checkOwnerAccess;
