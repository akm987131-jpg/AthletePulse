import mongoose from "mongoose";
import { env } from "./env";

// Interface for global connection cache to prevent duplicate connections during hot reload
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  memoryServerInstance?: any;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

/**
 * Connect to MongoDB Atlas or start an in-memory instance if no URI is provided.
 * Reuses existing connection across hot reloads.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached?.conn) {
    return cached.conn;
  }

  if (!cached?.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
    };

    cached!.promise = (async () => {
      let uri = env.MONGODB_URI;

      // If no MongoDB URI is set, start an in-memory database server for zero-friction local run/test
      if (!uri) {
        try {
          const { MongoMemoryServer } = await import("mongodb-memory-server");
          if (!cached!.memoryServerInstance) {
            console.log("[Database] No MONGODB_URI detected. Launching in-memory MongoDB instance...");
            cached!.memoryServerInstance = await MongoMemoryServer.create();
          }
          uri = cached!.memoryServerInstance.getUri();
          console.log("[Database] In-memory MongoDB started at:", uri);
        } catch (err) {
          console.error("[Database] Failed to start MongoMemoryServer:", err);
          throw new Error("No MONGODB_URI provided and in-memory MongoDB failed to initialize.");
        }
      }

      const m = await mongoose.connect(uri, opts);
      console.log("[Database] Successfully connected to MongoDB.");
      cached!.conn = m;

      // Auto-seed if database has 0 users so local demo works out of the box
      try {
        const { User } = await import("@/models/User");
        const count = await User.countDocuments();
        if (count === 0) {
          console.log("[Database] Database is empty. Auto-seeding demo accounts and logs...");
          const { seedDatabase } = await import("../../scripts/seed");
          await seedDatabase();
        }
      } catch (seedErr) {
        console.warn("[Database] Auto-seed check notice:", seedErr);
      }

      return m;
    })();
  }

  try {
    cached!.conn = await cached!.promise;
  } catch (e) {
    cached!.promise = null;
    throw e;
  }

  return cached!.conn!;
}

/**
 * Disconnect from MongoDB and shut down any in-memory instance (used in tests)
 */
export async function disconnectDatabase(): Promise<void> {
  if (cached?.conn) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
  if (cached?.memoryServerInstance) {
    await cached.memoryServerInstance.stop();
    cached.memoryServerInstance = undefined;
  }
}
