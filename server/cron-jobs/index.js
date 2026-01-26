import cron from "node-cron";
import { processSubscriptionStates } from "./processSubscriptionStates.js";
import { processAuthenticatedTrials } from "./authenticatedTrialProcessor.js";
import { cleanupOrphanedUploads } from "./cleanupUploads.js";

export const startCronJobs = () => {
  console.log("🚀 Initializing Cron Jobs...");


  processSubscriptionStates();

  console.log("✅ Cron Jobs registered successfully.");

  cron.schedule("0 * * * *", async () => {
    console.log("Running authenticated trial processor...");
    await processAuthenticatedTrials();
  });

  cleanupOrphanedUploads();
};
