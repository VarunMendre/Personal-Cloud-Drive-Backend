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
import { connectDB } from "./config/db.js";
import { startCronJobs } from "./cron-jobs/index.js";
import { initializeRedisindex } from "./utils/authUtils.js";
import { gitHubWebhook } from "./utils/gitHubWebhook.js";
import { sendDeploymentEmail } from "./services/emailService/deploymentEmail.js";

const mySecretKey = process.env.MY_SECRET_KEY;

connectDB();

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

const whitelist = ["https://cloudvault.cloud", "https://www.cloudvault.cloud"];

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

app.use("/directory", checkAuth, directoryRoutes);
app.use("/file", checkAuth, fileRoutes);
app.use("/", userRoutes);
app.use("/auth", authRoutes);
app.use("/import", checkAuth, importRoutes);
app.use("/share", shareRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/subscriptions", checkAuth, subscriptionRoutes);

app.post("/github-webhook", gitHubWebhook, (req, res, next) => {
  let repository;

  if (req.body.repository.name === "Personal-Cloud-Drive-Frontend") {
    repository = "frontend";
  } else if (req.body.repository.name === "Personal-Cloud-Drive-Backend-PM2") {
    repository = "backend";
  } else {
    return res
      .status(200)
      .json({ message: "Unknown repository, skipping deploy" });
  }

  console.log("Deploying:", repository);

  // Extract metadata for email
  const branch = req.body.ref ? req.body.ref.split("/").pop() : "unknown";
  const commit = req.body.head_commit || {};
  const repoName = req.body.repository?.full_name || "CloudVault Repository";
  const modifiedFiles = commit.modified || [];
  const pusher = req.body.pusher?.name || "GitHub Actions";

  const bashChildProcess = spawn("bash", [
    `/home/ubuntu/deploy-${repository}.sh`,
  ]);


  bashChildProcess.stdout.on("data", (data) => {
    process.stdout.write(data);
  });

  bashChildProcess.on("close", async (code) => {
    const status = code === 0 ? "Success" : "Failed";

    if (!code) {
      console.log(`We get exit code as : ${code}`);
      console.log("Script executed Successfully");
    } else {
      console.log("Script failed..");
    }

    // Send deployment notification email
    try {
      await sendDeploymentEmail({
        status,
        repository,
        repoName,
        branch,
        commit,
        modifiedFiles,
        pusher,
      });
      console.log(`Deployment email sent for ${repository} with status: ${status}`);
    } catch (emailError) {
      console.error("Failed to send deployment email:", emailError);
    }
  });

  bashChildProcess.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  bashChildProcess.on("error", (err) => {
    console.log("error while swapping the process");
    console.log(err);
  });

  res.status(202).json({ message: "Deployment started" });
});
// Testing rotes for AWS EC2
app.get("/", (req, res) => {
  res.json({ message: "Backend is Live from AWS" });
});

// Checking how pm2 not restarts the with npm command

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

app.listen(PORT, async () => {
  await initializeRedisindex();
  startCronJobs();
  console.log(`Server Started on port ${PORT}`);
});
