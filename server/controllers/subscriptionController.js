import {
  cancelSubscriptionService,
  changePlanService,
  createSubscriptionService,
  getEligiblePlanService,
  getSubscriptionDetailsService,
  pauseSubscriptionService,
  resumeSubscriptionService,
  checkSubscriptionStatusService,
  getSubscriptionInvoiceService,
} from "../services/subscription/index.js";
import { successResponse, errorResponse } from "../utils/response.js";
import asyncHandler from "../utils/asyncHandler.js";
import { CustomError } from "../utils/CustomError.js";

export const createSubscription = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const result = await createSubscriptionService(req.user._id, planId);
  return successResponse(res, result);
});

export const getSubscriptionDetails = asyncHandler(async (req, res) => {
  const details = await getSubscriptionDetailsService(req.user._id);

  if (!details) {
    throw new CustomError("No active subscription found", 404);
  }

  return successResponse(res, details);
});

export const getSubscriptionInvoice = asyncHandler(async (req, res) => {
  const result = await getSubscriptionInvoiceService(req.user._id);
  return successResponse(res, result);
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const result = await cancelSubscriptionService(req.user._id, planId);

  if (result && result.success === false) {
    throw new CustomError(result.message || "Failed to cancel subscription", 400);
  }

  return successResponse(res, result);
});

export const pauseSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params; // razorpaySubscriptionId
  const result = await pauseSubscriptionService(id);
  return successResponse(res, result);
});

export const resumeSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params; // razorpaySubscriptionId
  const result = await resumeSubscriptionService(id);
  return successResponse(res, result);
});

export const checkSubscriptionStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await checkSubscriptionStatusService(id);
  return successResponse(res, result);
});

export const renewalSubscription = asyncHandler(async (req, res) => {
  const result = await getEligiblePlanService(req.user._id);
  return successResponse(res, result);
});

export const changePlan = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const result = await changePlanService(req.user._id, planId);
  return successResponse(res, result);
});