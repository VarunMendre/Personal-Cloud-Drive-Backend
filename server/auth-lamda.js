import serverless from "serverless-http";
import app from "./app.js";
import { connectDB } from "./config/db.js";

// Ensure DB connection is established at the module level for container reuse
connectDB();

export const handler = serverless(app);
