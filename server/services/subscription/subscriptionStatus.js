import Webhook from "../../models/rzpwebhookModel.js";

export const checkSubscriptionStatusService = async (razorpaySubscriptionId) => {
  // check subscription status from razorpay

  const activationevent = await Webhook.findOne({
    razorpaySubscriptionId: razorpaySubscriptionId,
    eventType: "subscription.activated",
    status: "processed",
  });

  if (activationevent) {
    return { status: "active" };
  }

  return { active: false };
};
