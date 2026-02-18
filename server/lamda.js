import serverless from "serverless-http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";

const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
  // Allow the handler to exit without waiting for the event loop
  // (needed for DB and Redis connections to stay active between calls)
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Wait for critical connections
  await Promise.all([connectDB(), connectRedis()]);
  
  return serverlessHandler(event, context);
};