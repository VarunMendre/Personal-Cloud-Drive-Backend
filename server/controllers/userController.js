import Directory from "../models/directoryModel.js";
import File from "../models/fileModel.js";
import User from "../models/userModel.js";
import Subscription from "../models/subscriptionModel.js";
import OTP from "../models/otpModel.js";
import { getEditableRoles } from "../utils/permissions.js";
import redisClient from "../config/redis.js";
import { getFileUrl, createUploadSignedUrl, deletes3Files } from "../services/s3.js";
import { createCloudFrontSignedGetUrl } from "../services/cloudFront.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { sanitize } from "../utils/sanitizer.js";
import { runInTransaction } from "../utils/transactionHelper.js";
import { deleteUserSessions } from "../utils/authUtils.js";


export const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    return errorResponse(res, "User not found", 404);
  }

  const userDir = await Directory.findById(user.rootDirId);

  let pictureUrl = user.picture;
  // If the picture is an S3 key (starts with 'profile-pictures/'), sign it
  if (user.picture && user.picture.startsWith("profile-pictures/")) {
    try {
      pictureUrl = createCloudFrontSignedGetUrl({
        key: user.picture,
        filename: "profile-picture",
        download: false,
        expiresInMinutes: 60 * 24, // 24 hours for profile pictures
      });
    } catch (err) {
      console.error("Error signing profile picture URL:", err);
    }
  }

  return successResponse(res, {
    name: user.name,
    email: user.email,
    picture: pictureUrl,
    role: user.role,
    subscriptionId: user.subscriptionId,
    maxStorageLimit: user.maxStorageLimit,
    usedStorageInBytes: userDir ? userDir.size : 0,
    subscriptionStatus: user.subscriptionId ? (await Subscription.findOne({ razorpaySubscriptionId: user.subscriptionId }))?.status || "none" : "none",
    createdAt: userDir ? userDir.createdAt : user.createdAt,
  });
};

export const getProfilePictureUploadUrl = async (req, res) => {
  try {
    const { contentType, filename } = req.query;
    if (!contentType) {
      return errorResponse(res, "contentType is required", 400);
    }

    const extension = filename?.includes(".")
      ? filename.substring(filename.lastIndexOf("."))
      : ".jpg";

    const key = `profile-pictures/${req.user._id}-${Date.now()}${extension}`;

    const uploadUrl = await createUploadSignedUrl({
      key,
      contentType,
    });

    return successResponse(res, { uploadUrl, key });
  } catch (error) {
    console.error("Error getting profile picture upload URL:", error);
    return errorResponse(res, "Failed to get upload URL", 500);
  }
};

export const logout = async (req, res) => {
  try {
    const { sid } = req.signedCookies;
    if (sid) {
      await redisClient.del(`session:${sid}`);
    }
    res.clearCookie("sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      signed: true,
    });
    res.status(204).end();
  } catch (err) {
    console.error("Logout error:", err);
    return errorResponse(res, "Logout failed", 500);
  }
};

export const logoutAll = async (req, res) => {
  const { _id: userId } = req.user;
  try {
    await deleteUserSessions(userId.toString());
    res.clearCookie("sid");
    res.status(204).end();
  } catch (err) {
    return errorResponse(res, "Logout failed", 500);
  }
};

export const logOutById = async (req, res, next) => {
  try {
    const { userId } = req.params;
    await deleteUserSessions(userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const getUserPassword = async (req, res, next) => {
  try {
    // req.user is already populated by checkAuth middleware, forcing to return boolean value
    const hasPassword = !!(req.user.password && req.user.password.length > 0);

    return successResponse(res, { hasPassword });
  } catch (err) {
    console.error("Error checking password:", err);
    return errorResponse(res, "Error checking password status", 500);
  }
};



export const getAllUsers = async (req, res) => {
  const requestorRole = req.user.role;

  let query = { isDeleted: false };

  if (requestorRole === "Owner") {
    query = {};
  }

  if (requestorRole !== "Owner") {
    query.role = { $ne: "Owner" };
  }

  const allUsers = await User.find(query).lean();

  const userIds = allUsers.map(u => u._id);
  const rootDirs = await Directory.find({ userId: { $in: userIds }, parentDirId: null }).lean();

  const storageMap = {};
  rootDirs.forEach((dir) => {
    storageMap[dir.userId.toString()] = dir.size || 0;
  });


  const keys = await redisClient.keys("session:*");
  const allSessionsUserIdSet = new Set();


  if (keys.length > 0) {
    const rawSessions = await Promise.all(
      keys.map((key) => redisClient.json.get(key))
    );

    rawSessions.forEach((session) => {
      if (session && session.userId) {
        allSessionsUserIdSet.add(session.userId.toString());
      }
    });
  }

  // Fetch subscription data for these users
  const subscriptions = await Subscription.find({ userId: { $in: userIds } }).sort({ createdAt: -1 }).lean();
  const subscriptionMap = {};
  subscriptions.forEach(sub => {
    // Only keep the most recent one per user (since we sorted by createdAt: -1)
    if (!subscriptionMap[sub.userId.toString()]) {
      subscriptionMap[sub.userId.toString()] = {
        status: sub.status,
        razorpaySubscriptionId: sub.razorpaySubscriptionId
      };
    }
  });

  const transformedUsers = allUsers.map(({ _id, name, email, role, isDeleted, maxStorageLimit, subscriptionId }) => ({
    id: _id,
    name,
    email,
    role,
    isLoggedIn: allSessionsUserIdSet.has(_id.toString()),
    isDeleted: isDeleted || false,
    usedStorageInBytes: storageMap[_id.toString()] || 0,
    maxStorageLimit: maxStorageLimit || 0,
    subscriptionStatus: subscriptionMap[_id.toString()]?.status || "none",
    razorpaySubscriptionId: subscriptionMap[_id.toString()]?.razorpaySubscriptionId || subscriptionId || null
  }));

  return successResponse(res, transformedUsers);
};

export const softDeleteUser = async (req, res, next) => {
  const { userId } = req.params;
  if (req.user._id.toString() === userId) {
    return errorResponse(res, "You cannot delete your self", 403);
  }

  try {
    await runInTransaction(async (session) => {
      await User.findByIdAndUpdate({ _id: userId }, { isDeleted: true }, { session });
      await deleteUserSessions(userId);
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const hardDeleteUser = async (req, res, next) => {
  const { userId } = req.params;
  if (req.user._id.toString() === userId) {
    return errorResponse(res, "You cannot delete your self", 403);
  }

  if (req.user.role !== "Owner" && req.user.role !== "Admin") {
    return errorResponse(res, "You don't have permission to hard delete users", 403);
  }

  try {
    await runInTransaction(async (session) => {
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw { statusCode: 404, message: "User not found" }
      }

      const files = await File.find({ userId }).select("_id extension").lean();
      const s3Keys = files.map(file => ({ Key: `${file._id.toString()}${file.extension}` }));

      // Include profile picture if it's stored in S3
      if (user.picture && user.picture.startsWith("profile-pictures/")) {
        s3Keys.push({ Key: user.picture });
      }

      if (s3Keys.length > 0) {
        try {
          await deletes3Files(s3Keys);
        } catch (err) {
          console.error("Error deleting files from S3:", err);
          throw { statusCode: 500, message: "Error deleting files from S3" };
        }
      }

      await File.deleteMany({ userId }, { session });
      await Directory.deleteMany({ userId }, { session });
      await Subscription.deleteMany({ userId }, { session });
      await OTP.deleteMany({ email: user.email }, { session });
      await User.deleteOne({ _id: userId }, { session });
    });

    res.status(204).end();
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, err.statusCode);
    }
    next(err);
  }
};

export const recoverUser = async (req, res, next) => {
  const { userId } = req.params;
  if (req.user._id.toString() === userId) {
    return errorResponse(res, "You cannot delete your self", 403);
  }

  try {
    await runInTransaction(async (session) => {
      await User.findByIdAndUpdate(
        { _id: userId },
        { isDeleted: false },
        { session }
      );
    });

    return successResponse(res, null, `User has been recovered with UID: ${userId}`);
  } catch (err) {
    next(err);
  }
};

export const permissionPage = async (req, res, next) => {
  const loggedInUser = req.user;

  if (loggedInUser.role === "User") {
    return errorResponse(res, "Access denied: inSufficient permission", 403);
  }

  const editableRoles = getEditableRoles(loggedInUser.role);
  try {
    const users = await User.find({
      _id: { $ne: loggedInUser._id },
      role: { $in: editableRoles },
    }).select("name email role");

    return successResponse(res, {
      editableRoles,
      users,
    });
  } catch (err) {
    next(err);
  }
};

export const updateUserRole = async (req, res, next) => {
  const { userId } = req.params;
  const { role } = req.body;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  if (currentUserId === userId) {
    return errorResponse(res, "Cannot change you're own role!", 403);
  }

  try {
    const targetedUser = await User.findById(userId);

    if (!targetedUser) {
      return errorResponse(res, "User not found", 404);
    }

    const editableRoles = getEditableRoles(currentUserRole);

    if (!editableRoles.includes(role)) {
      return errorResponse(res, `You can only assign these roles: ${editableRoles.join(", ")}`, 403);
    }

    targetedUser.role = role;
    await targetedUser.save();

    return successResponse(res, {
      user: {
        id: targetedUser._id,
        name: targetedUser.name,
        email: targetedUser.email,
        role: targetedUser.role,
      },
    }, "Role updated successfully");
  } catch (err) {
    next(err);
  }
};

export const getUserFiles = async (req, res, next) => {
  const { userId } = req.params;
  const loggedInUser = req.user;

  if (!["Owner", "Admin"].includes(loggedInUser.role)) {
    return errorResponse(res, "Access denied", 403);
  }

  try {
    const files = await File.find({ userId }).lean();

    return successResponse(res, files);
  } catch (err) {
    next(err);
  }
};

export const deleteUserFiles = async (req, res, next) => {
  const { userId, fileId } = req.params;
  const loggedInUser = req.user;

  if (loggedInUser.role !== "Owner") {
    return errorResponse(res, "Only Owner can delete files", 403);
  }

  try {
    const file = await File.findOneAndDelete({ _id: fileId, userId });

    if (!file) {
      return errorResponse(res, "File not found", 404);
    }


    return successResponse(res, null, "File deleted successfully");
  } catch (err) {
    next(err);
  }
};

export const getUserFileView = async (req, res, next) => {
  const { userId, fileId } = req.params;
  const loggedInUser = req.user;

  if (!["Owner", "Admin"].includes(loggedInUser.role)) {
    return errorResponse(res, "Access denied", 403);
  }

  try {
    const fileData = await File.findOne({
      _id: fileId,
      userId: userId,
    }).lean();

    if (!fileData) {
      return errorResponse(res, "File not found", 404);
    }

    const s3Key = `${fileId}${fileData.extension}`;

    if (req.query.action === "download") {
      const getUrl = await getFileUrl({
        Key: s3Key,
        download: true,
        filename: fileData.name,
      });
      return res.redirect(getUrl);
    }

    const getUrl = createCloudFrontSignedGetUrl({
      key: s3Key,
      filename: fileData.name,
    });

    if (req.query.format === "json") {
      return successResponse(res, { url: getUrl });
    }

    return res.redirect(getUrl);
  } catch (err) {
    next(err);
  }
};

export const updateUserFile = async (req, res, next) => {
  const { userId, fileId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return errorResponse(res, "File name is required", 400);
  }

  try {
    const file = await File.findOne({
      _id: fileId,
      userId: userId,
    });

    if (!file) {
      return errorResponse(res, "File not found", 404);
    }

    file.name = name.trim();
    await file.save();

    return successResponse(res, null, "File renamed successfully");
  } catch (err) {
    next(err);
  }
};

export const getUserList = async (req, res, next) => {
  try {
    // Exclude deleted users and return only the basic fields needed by the UI
    const users = await User.find(
      { isDeleted: false },
      { _id: 1, name: 1, email: 1, picture: 1 }
    );

    const usersList = users.map((user) => ({
      userId: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture || "",
    }));

    return successResponse(res, usersList);
  } catch (err) {
    return errorResponse(res, "Failed to fetch users", 500);
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    const { name, picture } = sanitize(req.body);

    if (name) {
      user.name = name;
    }

    if (picture) {
      user.picture = picture;
    }

    await user.save();

    let pictureUrl = user.picture;
    if (user.picture && user.picture.startsWith("profile-pictures/")) {
      pictureUrl = createCloudFrontSignedGetUrl({
        key: user.picture,
        filename: "profile-picture",
        download: false,
        expiresInMinutes: 60 * 24,
      });
    }

    const userObj = user.toObject();
    delete userObj.password;
    userObj.picture = pictureUrl;

    return successResponse(res, userObj, "Profile updated successfully");
  } catch (error) {
    console.error("Update profile error:", error);
    return errorResponse(res, "Failed to update profile", 500);
  }
};