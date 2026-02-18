import serverless from "serverless-http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";

import { initializeRedisindex } from "./utils/authUtils.js";

const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
    // Allow the handler to exit without waiting for the event loop
    context.callbackWaitsForEmptyEventLoop = false;

    // Diagnostic: Log available environment variables (keys only)
    const requiredVars = ['DB_URL', 'REDIS_HOST', 'CLIENT_ORIGIN', 'MY_SECRET_KEY'];
    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      console.warn("CRITICAL: Missing environment variables in Lambda:", missing.join(', '));
    } else {
      console.log("Environment variables verified: All critical keys present.");
    }

    // Wait for critical connections
    await Promise.all([connectDB(), connectRedis()]);
    await initializeRedisindex(); // Ensure search index exists for session lookups

    return serverlessHandler(event, context);
};