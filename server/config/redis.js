import { createClient } from "redis";

const redisClient = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    keepAlive: 10000,
    connectTimeout: 10000, // Increase timeout for Cloud instances
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("Redis reconnection failed after 10 attempts");
        return new Error("Redis reconnection failed");
      }
      return Math.min(retries * 100, 3000); // Exponential backoff
    }
  },
});

redisClient.on("connect", () => console.log("Redis Client Connecting..."));
redisClient.on("ready", () => console.log("Redis Client Ready"));
redisClient.on("error", (err) => {
  // Suppress timeout errors in console if it's just a temporary reconnect
  if (err.message.includes("Connection timeout")) {
    console.warn("Redis Connection Timeout... retrying");
  } else {
    console.error("Redis Client Error:", err);
  }
});
redisClient.on("reconnecting", () => console.log("Redis Client Reconnecting..."));

let connectingPromise = null;

const connectRedis = async () => {
  if (redisClient.isOpen) return;
  if (connectingPromise) return connectingPromise;

  if (!process.env.REDIS_HOST) {
    console.warn("REDIS_HOST environment variable is MISSING. Redis features will be disabled.");
    return;
  }

  connectingPromise = (async () => {
    try {
      await redisClient.connect();
      console.log("RedisDB connected");
    } catch (err) {
      console.error("Redis connection failed:", err.message);
      // Don't re-throw to prevent Init-phase crashes
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
};

// Initial connection attempt (Top-level await for module-level reliability)
if (process.env.REDIS_HOST) {
  try {
    await connectRedis();
  } catch (err) {
    console.error("Critical: Initial Redis connection failed during module load.");
  }
}

export { connectRedis };
export default redisClient;
