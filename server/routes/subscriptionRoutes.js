import express from "express";
import {
  createSubscription,
  getSubscriptionDetails,
  getSubscriptionInvoice,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  renewalSubscription,
  changePlan,
} from "../controllers/subscriptionController.js";
import checkAuth from "../middlewares/authMiddleware.js";
import { checkSubscriptionStatus } from "../controllers/subscriptionController.js";
import { rateLimiters } from "../utils/rateLimiting.js";
import { processSubscriptionStates } from "../cron-jobs/subscriptionProcessor.js";
import { processTrialTransitions } from "../cron-jobs/trialProcessor.js";
import { cleanOrphanedUploads } from "../cron-jobs/uploadCleanup.js";

const router = express.Router();

router.post("/", createSubscription);
router.post("/cancel", checkAuth, cancelSubscription);
router.post("/:id/pause", checkAuth, pauseSubscription);
router.post("/:id/resume", checkAuth, resumeSubscription);
router.get("/details", checkAuth, getSubscriptionDetails);

// invoice

router.get("/invoice", checkAuth, getSubscriptionInvoice);

// check subscription status
router.get("/status/:id", checkAuth, checkSubscriptionStatus);

// Change Plan

router.get("/eligible-plans", checkAuth, renewalSubscription);
router.post("/change-plan", checkAuth, rateLimiters.upgradeLimiter, changePlan);

// cron jobs
router.get("/run-cron/subscription-processor", processSubscriptionStates);
router.get("/run-cron/trial-processor", processTrialTransitions);
router.get("/run-cron/upload-cleanup", cleanOrphanedUploads);

export default router;
