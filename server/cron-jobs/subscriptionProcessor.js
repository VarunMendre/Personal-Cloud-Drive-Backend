import User from "../models/userModel.js";
import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/response.js";
import Subscription from "../models/subscriptionModel.js";
import { resetUserToDefault, deleteSubscriptionFiles } from "../utils/resetUserLimits.js";
import { sendSubscriptionHaltedEmail } from "../services/emailService/subscriptionHalted.js";
import { sendSubscriptionCancelledEmail } from "../services/emailService/subscriptionCancelled.js";


/**
 * Subscription State Processor
 * Performs:
 * 1. Pending (Day 3) -> Halted
 * 2. Halted (Day 4) -> Cancelled (Purge)
 */



export const processSubscriptionStates = asyncHandler(async (req, res, next) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const reports = {
        halted: 0,
        cancelled: 0,
        errors: []
    };

    // 1. Pending -> Halted (Day 3)

    const pendingSubs = await Subscription.find({
        status: "pending",
        gracePeriodEndsAt: { $lte: now }
    });


    for (const sub of pendingSubs) {
        try {
            sub.status = 'halted';
            sub.haltedAt = now;
            sub.gracePeriodEndsAt = null;
            await sub.save();

            await resetUserToDefault(sub.userId);
            const user = await User.findById(sub.userId);
            
            if (user) 
                await sendSubscriptionHaltedEmail(user.email, user.name);

            reports.halted++;
        } catch (error) {
            reports.errors.push({
                userId: sub.userId,
                error: error.message
            });
        }   
    }

    // 2. Halted (Day 4) -> Cancelled (Purge)
    const haltedSubs = await Subscription.find({
        status: "halted",
        haltedAt: { $lte: twentyFourHoursAgo }
    });

    for (const sub of haltedSubs) {
        try {
            sub.status = 'cancelled';
            await sub.save();

            await deleteSubscriptionFiles(sub.userId);
            const user = await User.findById(sub.userId);
            
            if (user) 
                await sendSubscriptionCancelledEmail(user.email, user.name);

            reports.cancelled++;
        } catch (error) {
            reports.errors.push({
                userId: sub.userId,
                error: error.message
            });
        }   
    }

    return successResponse(res, reports, "Subscription states processed successfully");
    
})