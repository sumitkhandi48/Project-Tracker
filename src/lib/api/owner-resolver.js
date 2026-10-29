import { connectToDatabase } from "../db/mongodb.js";
import User from "../../models/User.js";

/**
 * Resolves the verified Mongoose User ObjectId for the authenticated owner session.
 * Ensures the database owner reference is always valid.
 *
 * @param {object} session Verified NextAuth session
 * @returns {Promise<import("mongoose").Types.ObjectId>} Mongoose User _id
 */
export async function getVerifiedOwnerId(session) {
  if (!session?.user?.githubId) {
    throw new Error("Missing verified provider ID in session");
  }

  await connectToDatabase();
  const githubIdStr = String(session.user.githubId).trim();

  let dbUser = await User.findOne({ githubId: githubIdStr });

  if (!dbUser) {
    // If User record does not exist yet, initialize it from session
    const email = (
      session.user.email ||
      `${githubIdStr}+owner@users.noreply.github.com`
    ).toLowerCase();

    dbUser = await User.findOne({ email });

    if (!dbUser) {
      dbUser = new User({
        name: session.user.name || "Owner",
        email,
        image: session.user.image || null,
        githubId: githubIdStr,
      });
      await dbUser.save();
    } else if (!dbUser.githubId) {
      dbUser.githubId = githubIdStr;
      await dbUser.save();
    }
  }

  return dbUser._id;
}
