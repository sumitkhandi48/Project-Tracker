import mongoose from "mongoose";

/**
 * Global connection cache for Next.js hot-reload persistence.
 * Prevents multiple connections during serverless cold starts and HMR cycles.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connects to MongoDB using Mongoose with connection pooling and caching.
 * Server-side only. Does NOT connect at module import time.
 *
 * @returns {Promise<typeof mongoose>} Resolved mongoose instance.
 */
export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI environment variable. Please configure it in your environment or .env.local."
    );
  }

  // If a healthy connection already exists, return it immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // If a connection is already in progress, await the existing promise
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose
      .connect(uri, opts)
      .then((mongooseInstance) => {
        cached.conn = mongooseInstance;
        return mongooseInstance;
      })
      .catch((err) => {
        // Reset cached promise so subsequent attempts can retry
        cached.promise = null;
        const sanitizedMessage = err.message || "Failed to connect to MongoDB";
        throw new Error(`MongoDB connection error: ${sanitizedMessage}`);
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

export default connectToDatabase;
