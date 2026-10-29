import GithubProviderModule from "next-auth/providers/github";
import { connectToDatabase } from "../db/mongodb.js";
import User from "../../models/User.js";

// Safe CommonJS / ESM interop for next-auth provider export across Webpack and native Node
const GithubProvider =
  typeof GithubProviderModule === "function"
    ? GithubProviderModule
    : typeof GithubProviderModule?.default === "function"
    ? GithubProviderModule.default
    : GithubProviderModule?.default?.default || GithubProviderModule;

/**
 * NextAuth configuration for GitHub OAuth authentication and Mongoose user integration.
 * Evaluates owner authorization server-side against process.env.OWNER_GITHUB_ID.
 */
export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
     * Synchronizes authenticated GitHub profile with Mongoose User collection on sign-in.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider === "github" && profile?.id) {
        try {
          await connectToDatabase();
          const githubIdStr = String(profile.id);
          const email = (profile.email || user.email || `${githubIdStr}+github@users.noreply.github.com`).toLowerCase();

          let dbUser = await User.findOne({
            $or: [{ githubId: githubIdStr }, { email }],
          });

          if (!dbUser) {
            dbUser = new User({
              name: profile.name || profile.login || user.name || "Developer",
              email,
              image: profile.avatar_url || user.image || null,
              githubId: githubIdStr,
            });
            await dbUser.save();
          } else {
            // Update fields and ensure githubId is linked
            let modified = false;
            if (!dbUser.githubId) {
              dbUser.githubId = githubIdStr;
              modified = true;
            }
            if (profile.name && dbUser.name !== profile.name) {
              dbUser.name = profile.name;
              modified = true;
            }
            if (profile.avatar_url && dbUser.image !== profile.avatar_url) {
              dbUser.image = profile.avatar_url;
              modified = true;
            }
            if (modified) {
              await dbUser.save();
            }
          }
        } catch (err) {
          // Log sanitized error without revealing database credentials
          console.error("Auth: Failed to synchronize Mongoose user:", err.message);
          // Allow sign in to proceed so session can still be evaluated
        }
      }
      return true;
    },

    /**
     * Attaches stable GitHub ID and owner authorization status to the encrypted JWT token.
     */
    async jwt({ token, profile, user }) {
      if (profile?.id) {
        token.githubId = String(profile.id);
      }
      if (user?.id) {
        token.userId = String(user.id);
      }

      // Authorize strictly against the server environment variable
      const ownerGithubId = process.env.OWNER_GITHUB_ID;
      token.isOwner = Boolean(
        ownerGithubId &&
        token.githubId &&
        token.githubId === ownerGithubId.trim()
      );

      return token;
    },

    /**
     * Exposes verified provider identity and authorization status to the server session.
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId || token.sub;
        session.user.githubId = token.githubId || null;
        session.user.isOwner = Boolean(token.isOwner);
      }
      return session;
    },
  },
};

export default authOptions;
