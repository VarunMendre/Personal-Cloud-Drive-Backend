import Subscription from "../models/subscriptionModel.js";
import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/response.js";

/**
 * Authenticated Trial Processor
 * Moves users from 'authenticated' (bonus trial) back to 'active'
 * when their trial period ends.
 */
export const processTrialTransitions = asyncHandler(async (req, res, next) => {
    const now = new Date();

    const reports = {
        transitioned: 0,
        errors: []
    };

    // Find subscriptions where authenticated period has ended 
    const expiredTrials = await Subscription.find({
        status: "authenticated",
        authenticatedPeriodEnd: { $lte: now }
    });

    for (const sub of expiredTrials) {
        try {
            sub.status = "active";
            await sub.save();

            reports.transitioned++;
            console.log(`[Cron] Trial expired for sub: ${sub.razorpaySubscriptionId}. Moved to ACTIVE.`);
        } catch (error) {
            reports.errors.push({
                subscriptionId: sub.razorpaySubscriptionId,
                error: error.message
            });
        }
    }

    return successResponse(res, reports, "Authenticated trials processed successfully");
});
