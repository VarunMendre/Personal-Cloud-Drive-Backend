import "dotenv/config.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import directoryRoutes from "./routes/directoryRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import checkAuth from "./middlewares/authMiddleware.js";
import helmet from "helmet";
import { spawn } from "child_process";
import { rateLimit } from "express-rate-limit";
import { gitHubWebhook } from "./utils/gitHubWebhook.js";





const app = express();
const PORT = process.env.PORT || 4000;

app.set("trust proxy", 1);

if (!process.env.MY_SECRET_KEY) {
  console.error(
    "CRITICAL: MY_SECRET_KEY is not defined in environment variables!"
  );
}

app.use(
  cookieParser(process.env.MY_SECRET_KEY || "fallback_secret_for_local_only")
);
app.use(express.json());
const clientOrigin = process.env.CLIENT_ORIGIN?.replace(/\/$/, "");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "frame-ancestors": ["'self'", clientOrigin],
      },
    },
  })
);

const whitelist = [
  "https://cloudvault.cloud",
  "https://www.cloudvault.cloud",
  clientOrigin,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (whitelist.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
);

// Routes
app.use("/user", userRoutes);
app.use("/auth", authRoutes);
app.use("/directory", checkAuth, directoryRoutes);
app.use("/file", checkAuth, fileRoutes);
app.use("/import", checkAuth, importRoutes);
app.use("/share", shareRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/subscriptions", checkAuth, subscriptionRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({ message: "Storage App Backend is Live on Serverless Lambda & Sent Telegram Notification" });
});

app.get("/err", (req, res) => {
  console.log("Process exited with error");
  process.exit(1);
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const message = err.message || "Something went wrong!";
  res.status(status).json({ status, message });
});

if (!process.env.LAMBDA_TASK_ROOT) {
  app.listen(PORT, () => {
    console.log(`Server Started on port ${PORT}`);
  });
}


export default app;