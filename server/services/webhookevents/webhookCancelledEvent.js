import Subscription from "../../models/subscriptionModel.js";
import User from "../../models/userModel.js";
import { resetUserToDefault, deleteSubscriptionFiles } from "../../utils/resetUserLimits.js";
import { sendSubscriptionCancelledEmail } from "../emailService/subscriptionCancelled.js";

export const handleCancelledEvent = async (webhookBody) => {
  const rzpSubscription = webhookBody.payload.subscription.entity;

  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: rzpSubscription.id,
  });

  if (subscription) {
    subscription.status = "cancelled";
    subscription.cancelledAt = new Date().toISOString();
    await subscription.save();

    // Mark any other 'created' or 'pending' subscriptions as expired to prevent ghosting
    await Subscription.updateMany(
      {
        userId: subscription.userId,
        razorpaySubscriptionId: { $ne: rzpSubscription.id },
        status: { $in: ["created", "pending"] }
      },
      { $set: { status: "expired" } }
    );

    // Reset user to default limits and delete subscription-only files
    await resetUserToDefault(subscription.userId);
    await deleteSubscriptionFiles(subscription.userId);

    // send Cancellation Email
    try {
      const user = await User.findById(subscription.userId);
      if (user) {
        await sendSubscriptionCancelledEmail(user.email, user.name);
      }
    } catch (emailErr) {
      console.error("[Cancellation] Failed to send email:", emailErr.message);
    }

    console.log(
      `Subscription cancelled for user ${subscription.userId} via webhook.`
    );
  } else {
    console.warn(`[Webhook] Subscription ${rzpSubscription.id} not found in database. Skipping cancellation email.`);
  }
};
