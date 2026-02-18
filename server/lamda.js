import serverless from "serverless-http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";

import { initializeRedisindex } from "./utils/authUtils.js";

const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
    // Allow the handler to exit without waiting for the event loop
    context.callbackWaitsForEmptyEventLoop = false;

    // Wait for critical connections
    await Promise.all([connectDB(), connectRedis()]);
    await initializeRedisindex(); // Ensure search index exists for session lookups

    return serverlessHandler(event, context);
};