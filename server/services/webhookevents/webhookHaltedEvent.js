import User from "../../models/userModel.js";
import Subscription from "../../models/subscriptionModel.js";
import { resetUserToDefault } from "../../utils/resetUserLimits.js";
import { sendSubscriptionHaltedEmail } from "../emailService/subscriptionHalted.js";

export const webhookHaltedEvent = async (webhookBody) => {
  const { id: razorpaySubscriptionId } = webhookBody.payload.subscription.entity;

  try {
    const subscription = await Subscription.findOneAndUpdate(
      { razorpaySubscriptionId },
      {
        status: "halted",
        gracePeriodEndsAt: null,
        haltedAt: new Date(), // Anchor for Day 4 cron
      },
      { new: true }
    );

    if (subscription) {
      // Revert to free tier limits (already refactored to NOT delete files)
      await resetUserToDefault(subscription.userId);

      // Send Halted Email
      try {
        const user = await User.findById(subscription.userId);
        if (user) {
          await sendSubscriptionHaltedEmail(user.email, user.name);
        }
      } catch (emailErr) {
        console.error("Failed to send halted email:", emailErr.message);
      }

      console.log(`🛑 User limits reset for halted subscription: ${razorpaySubscriptionId}`);
    }
  } catch (error) {
    console.error("Error while halting", error);
  }

  console.log(`🛑 Subscription ${razorpaySubscriptionId} marked as HALTED.`);
};
