import { connectDB } from "../config/db.js";
import { connectRedis } from "../config/redis.js";
import { initializeRedisindex } from "../utils/authUtils.js";
import { processSubscriptionStates } from "../cron-jobs/subscriptionProcessor.js";
import { processTrialTransitions } from "../cron-jobs/trialProcessor.js";
import { cleanOrphanedUploads } from "../cron-jobs/uploadCleanup.js";

/**
 * Shared initialization for all cron jobs
 */
const init = async () => {
    // Wait for critical connections
    await Promise.all([connectDB(), connectRedis()]);
    // Ensure search index exists for any session-related logic if needed
    await initializeRedisindex();
};

/**
 * Mocking Express req/res for the cron jobs since they use successResponse
 */
const mockRes = {
    status: (code) => ({
        json: (data) => console.log(`[Response ${code}]`, JSON.stringify(data, null, 2))
    })
};

export const subscriptionProcessor = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    await init();
    return await processSubscriptionStates({}, mockRes, (err) => console.error(err));
};

export const trialProcessor = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    await init();
    return await processTrialTransitions({}, mockRes, (err) => console.error(err));
};

export const uploadCleanup = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    await init();
    return await cleanOrphanedUploads({}, mockRes, (err) => console.error(err));
};
