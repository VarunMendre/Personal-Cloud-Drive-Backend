import serverless from "serverless-http";
import app from "./app.js";
import { connectDB } from "./config/db.js";

// Ensure DB connection is established at the module level for container reuse
connectDB().catch(err => console.error("Initial DB connection failed:", err));

export const handler = serverless(app);
