// import cron from "node-cron"; // Removed for Lambda compatibility
import { processSubscriptionStates } from "./processSubscriptionStates.js";
import { processAuthenticatedTrials } from "./authenticatedTrialProcessor.js";
import { cleanupOrphanedUploads } from "./cleanupUploads.js";

/**
 * NOTE: In AWS Lambda, standard cron jobs (node-cron) do not work.
 * These functions should be triggered by AWS EventBridge (CloudWatch Events).
 */
export const startCronJobs = () => {
  console.log("🚀 Initializing Jobs (Local Only)...");

  // Immediate executions (if any)
  processSubscriptionStates();
  cleanupOrphanedUploads();

  console.log("✅ Local jobs initialized. Note: Scheduled tasks via node-cron are disabled for Lambda.");

  // To run processAuthenticatedTrials on Lambda, create a separate EventBridge trigger 
  // that calls a specific endpoint or invokes this function.
};
