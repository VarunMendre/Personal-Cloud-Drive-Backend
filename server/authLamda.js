import serverless from "serverless-http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { initializeRedisindex } from "./utils/authUtils.js";

const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
  // Allow the handler to exit without waiting for the event loop
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Auth Lambda really needs DB, Redis, and Search Index
  await Promise.all([connectDB(), connectRedis()]);
  await initializeRedisindex(); 
  
  return serverlessHandler(event, context);
};
