import { successResponse, errorResponse } from "../utils/response.js";
import asyncHandler from "../utils/asyncHandler.js";
import { CustomError } from "../utils/CustomError.js";
import {
  getSharedUsersService,
  shareWithUserService,
  updateUserAccessService,
  removeUserAccessService,
  generateShareLinkService,
  updateShareLinkService,
  disableShareLinkService,
  getDashboardStatsService,
  getRecentActivityService,
  getSharedWithMeService,
  getSharedByMeService,
  getPublicSharedResourceService,
} from "../services/share/shareService.js";

export const getSharedUsers = asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  const currentUserId = req.user._id;

  const result = await getSharedUsersService(resourceType, resourceId, currentUserId);
  return successResponse(res, result);
});

export const shareWithUser = asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  const { email, role } = req.body;
  const currentUserId = req.user._id;

  if (!email || !role) {
    throw new CustomError("Email & role are required", 400);
  }

  await shareWithUserService(resourceType, resourceId, email, role, currentUserId);
  return successResponse(res, null, "Shared successfully");
});

export const updateUserAccess = asyncHandler(async (req, res) => {
  const { resourceType, resourceId, userId } = req.params;
  const { role } = req.body;
  const currentUserId = req.user._id;

  await updateUserAccessService(resourceType, resourceId, userId, role, currentUserId);
  return successResponse(res, null, "Access updated");
});

export const removeUserAccess = asyncHandler(async (req, res) => {
  const { resourceType, resourceId, userId } = req.params;
  const currentUserId = req.user._id;

  await removeUserAccessService(resourceType, resourceId, userId, currentUserId);
  return successResponse(res, null, "Access removed");
});

export const generateShareLink = asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  const { role } = req.body;
  const currentUserId = req.user._id;
  const origin = req.get("origin") || process.env.CLIENT_URL;

  const result = await generateShareLinkService(resourceType, resourceId, role, currentUserId, origin);
  return successResponse(res, result);
});

export const updateShareLink = asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  const { role } = req.body;
  const currentUserId = req.user._id;

  await updateShareLinkService(resourceType, resourceId, role, currentUserId);
  return successResponse(res, null, "Link updated");
});

export const disableShareLink = asyncHandler(async (req, res) => {
  const { resourceType, resourceId } = req.params;
  const currentUserId = req.user._id;

  await disableShareLinkService(resourceType, resourceId, currentUserId);
  return successResponse(res, null, "Link disabled");
});

export const getDashboardStats = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;

  const result = await getDashboardStatsService(currentUserId);
  return successResponse(res, result);
});

export const getRecentActivity = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;

  const result = await getRecentActivityService(currentUserId);
  return successResponse(res, result);
});

export const getSharedWithMe = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;

  const result = await getSharedWithMeService(currentUserId);
  return successResponse(res, result);
});

export const getSharedByMe = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;

  const result = await getSharedByMeService(currentUserId);
  return successResponse(res, result);
});

export const getCollaborators = asyncHandler(async (req, res) => {
  return successResponse(res, []);
});

export const getPublicSharedResource = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const result = await getPublicSharedResourceService(token);
  return successResponse(res, result);
});