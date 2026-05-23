import Directory from "../../models/directoryModel.js";
import File from "../../models/fileModel.js";
import User from "../../models/userModel.js";
import Subscription from "../../models/subscriptionModel.js";
import OTP from "../../models/otpModel.js";
import { getEditableRoles } from "../../utils/permissions.js";
import redisClient from "../../config/redis.js";
import { getFileUrl, createUploadSignedUrl, deletes3Files } from "../s3.js";
import { createCloudFrontSignedGetUrl } from "../cloudFront.js";
import { runInTransaction } from "../../utils/transactionHelper.js";
import { deleteUserSessions } from "../../utils/authUtils.js";
import { CustomError } from "../../utils/CustomError.js";

export const getCurrentUserService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new CustomError("User not found", 404);
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

  return {
    name: user.name,
    email: user.email,
    picture: pictureUrl,
    role: user.role,
    subscriptionId: user.subscriptionId,
    maxStorageLimit: user.maxStorageLimit,
    usedStorageInBytes: userDir ? userDir.size : 0,
    subscriptionStatus: user.subscriptionId ? (await Subscription.findOne({ razorpaySubscriptionId: user.subscriptionId }))?.status || "none" : "none",
    createdAt: userDir ? userDir.createdAt : user.createdAt,
  };
};

export const getProfilePictureUploadUrlService = async (userId, contentType, filename) => {
  if (!contentType) {
    throw new CustomError("contentType is required", 400);
  }

  const extension = filename?.includes(".")
    ? filename.substring(filename.lastIndexOf("."))
    : ".jpg";

  const key = `profile-pictures/${userId}-${Date.now()}${extension}`;

  const uploadUrl = await createUploadSignedUrl({
    key,
    contentType,
  });

  return { uploadUrl, key };
};

export const logoutService = async (sid) => {
  if (sid) {
    await redisClient.del(`session:${sid}`);
  }
};

export const logoutAllService = async (userId) => {
  await deleteUserSessions(userId.toString());
};

export const getAllUsersService = async (requestorRole) => {
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

  const keys = [];
  let cursor = "0";
  try {
    do {
      const response = await redisClient.scan(cursor, { MATCH: "session:*", COUNT: 100 });
      cursor = response.cursor;
      keys.push(...response.keys);
    } while (cursor !== "0");
  } catch (err) {
    console.error("Redis SCAN failed, falling back to KEYS as a safety measure:", err);
    const fallbackKeys = await redisClient.keys("session:*");
    keys.push(...fallbackKeys);
  }
  
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
    if (!subscriptionMap[sub.userId.toString()]) {
      subscriptionMap[sub.userId.toString()] = {
        status: sub.status,
        razorpaySubscriptionId: sub.razorpaySubscriptionId
      };
    }
  });

  return allUsers.map(({ _id, name, email, role, isDeleted, maxStorageLimit, subscriptionId }) => ({
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
};

export const softDeleteUserService = async (userId, currentUserId) => {
  if (currentUserId.toString() === userId) {
    throw new CustomError("You cannot delete your self", 403);
  }

  await runInTransaction(async (session) => {
    await User.findByIdAndUpdate({ _id: userId }, { isDeleted: true }, { session });
    await deleteUserSessions(userId);
  });
};

export const hardDeleteUserService = async (userId, currentUserId, currentUserRole) => {
  if (currentUserId.toString() === userId) {
    throw new CustomError("You cannot delete your self", 403);
  }

  if (currentUserRole !== "Owner" && currentUserRole !== "Admin") {
    throw new CustomError("You don't have permission to hard delete users", 403);
  }

  await runInTransaction(async (session) => {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new CustomError("User not found", 404);
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
        throw new CustomError("Error deleting files from S3", 500);
      }
    }

    await File.deleteMany({ userId }, { session });
    await Directory.deleteMany({ userId }, { session });
    await Subscription.deleteMany({ userId }, { session });
    await OTP.deleteMany({ email: user.email }, { session });
    await User.deleteOne({ _id: userId }, { session });
  });
};

export const recoverUserService = async (userId, currentUserId) => {
  if (currentUserId.toString() === userId) {
    throw new CustomError("You cannot delete your self", 403);
  }

  await runInTransaction(async (session) => {
    await User.findByIdAndUpdate(
      { _id: userId },
      { isDeleted: false },
      { session }
    );
  });
};

export const getPermissionPageService = async (currentUser) => {
  if (currentUser.role === "User") {
    throw new CustomError("Access denied: inSufficient permission", 403);
  }

  const editableRoles = getEditableRoles(currentUser.role);
  const users = await User.find({
    _id: { $ne: currentUser._id },
    role: { $in: editableRoles },
  }).select("name email role");

  return {
    editableRoles,
    users,
  };
};

export const updateUserRoleService = async (userId, role, currentUserId, currentUserRole) => {
  if (currentUserId === userId) {
    throw new CustomError("Cannot change you're own role!", 403);
  }

  const targetedUser = await User.findById(userId);

  if (!targetedUser) {
    throw new CustomError("User not found", 404);
  }

  const editableRoles = getEditableRoles(currentUserRole);

  if (!editableRoles.includes(role)) {
    throw new CustomError(`You can only assign these roles: ${editableRoles.join(", ")}`, 403);
  }

  targetedUser.role = role;
  await targetedUser.save();

  return {
    user: {
      id: targetedUser._id,
      name: targetedUser.name,
      email: targetedUser.email,
      role: targetedUser.role,
    },
  };
};

export const getUserFilesService = async (userId, currentUser) => {
  if (!["Owner", "Admin"].includes(currentUser.role)) {
    throw new CustomError("Access denied", 403);
  }

  const files = await File.find({ userId }).lean();
  return files;
};

export const deleteUserFilesService = async (userId, fileId, currentUser) => {
  if (currentUser.role !== "Owner") {
    throw new CustomError("Only Owner can delete files", 403);
  }

  const file = await File.findOneAndDelete({ _id: fileId, userId });

  if (!file) {
    throw new CustomError("File not found", 404);
  }
};

export const getUserFileViewService = async (userId, fileId, currentUser, action, format) => {
  if (!["Owner", "Admin"].includes(currentUser.role)) {
    throw new CustomError("Access denied", 403);
  }

  const fileData = await File.findOne({
    _id: fileId,
    userId: userId,
  }).lean();

  if (!fileData) {
    throw new CustomError("File not found", 404);
  }

  const s3Key = `${fileId}${fileData.extension}`;

  if (action === "download") {
    const getUrl = await getFileUrl({
      Key: s3Key,
      download: true,
      filename: fileData.name,
    });
    return { type: "redirect", url: getUrl };
  }

  const getUrl = createCloudFrontSignedGetUrl({
    key: s3Key,
    filename: fileData.name,
  });

  if (format === "json") {
    return { type: "json", url: getUrl };
  }

  return { type: "redirect", url: getUrl };
};

export const updateUserFileService = async (userId, fileId, name) => {
  if (!name || !name.trim()) {
    throw new CustomError("File name is required", 400);
  }

  const file = await File.findOne({
    _id: fileId,
    userId: userId,
  });

  if (!file) {
    throw new CustomError("File not found", 404);
  }

  file.name = name.trim();
  await file.save();
};

export const getUserListService = async () => {
  // Exclude deleted users and return only the basic fields needed by the UI
  const users = await User.find(
    { isDeleted: false },
    { _id: 1, name: 1, email: 1, picture: 1 }
  );

  return users.map((user) => ({
    userId: user._id,
    name: user.name,
    email: user.email,
    picture: user.picture || "",
  }));
};

export const updateUserProfileService = async (userId, name, picture) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new CustomError("User not found", 404);
  }

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

  return userObj;
};
