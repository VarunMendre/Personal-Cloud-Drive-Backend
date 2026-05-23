import crypto from "crypto";
import User from "../../models/userModel.js";
import File from "../../models/fileModel.js";
import Directory from "../../models/directoryModel.js";
import { createCloudFrontSignedGetUrl } from "../cloudFront.js";
import { getFileUrl } from "../s3.js";
import { runInTransaction } from "../../utils/transactionHelper.js";
import { CustomError } from "../../utils/CustomError.js";

export const getSharedUsersService = async (resourceType, resourceId, currentUserId) => {
  let Model;
  if (resourceType === "file") {
    Model = File;
  } else if (resourceType === "folder") {
    throw new CustomError("Folder sharing is disabled", 400);
  } else {
    throw new CustomError("Invalid Resource Type", 400);
  }

  const resource = await Model.findById(resourceId)
    .populate("userId", "name email picture")
    .populate("sharedWith.userId", "name email picture");

  if (!resource) {
    throw new CustomError("Resource not found", 404);
  }

  const isOwner = resource.userId._id.toString() === currentUserId.toString();
  const isShared = resource.sharedWith.some(
    (s) => s.userId && s.userId._id.toString() === currentUserId.toString()
  );

  if (!isOwner && !isShared) {
    throw new CustomError("Unauthorized", 403);
  }

  return {
    owner: resource.userId,
    sharedWith: resource.sharedWith.map((s) => ({
      userId: s.userId._id,
      name: s.userId.name,
      email: s.userId.email,
      picture: s.userId.picture,
      role: s.role,
      sharedAt: s.sharedAt,
    })),
    shareLink: resource.shareLink,
  };
};

export const shareWithUserService = async (resourceType, resourceId, email, role, currentUserId) => {
  await runInTransaction(async (session) => {
    // Finding the user to share with
    const userTOShare = await User.findOne({ email }).session(session);
    if (!userTOShare) {
      throw new CustomError("User not found with this email", 404);
    }

    if (userTOShare._id.toString() === currentUserId.toString()) {
      throw new CustomError("You cannot share yourself", 400);
    }

    // Find the Resource;
    let Model;
    if (resourceType === "file") {
      Model = File;
    } else if (resourceType === "folder") {
      throw new CustomError("Folder sharing is disabled", 400);
    } else {
      throw new CustomError("Invalid Resource Type", 400);
    }

    const resource = await Model.findById(resourceId).session(session);
    if (!resource) {
      throw new CustomError("Resource Not found", 404);
    }

    // Check if current user is Owner
    if (resource.userId.toString() !== currentUserId.toString()) {
      throw new CustomError("Only the owner can share this resource", 403);
    }

    const existingShare = resource.sharedWith.find(
      (share) => share.userId.toString() === userTOShare._id.toString()
    );

    if (existingShare) {
      existingShare.role = role;
    } else {
      resource.sharedWith.push({
        userId: userTOShare._id,
        role: role,
        sharedAt: new Date(),
      });
    }

    await resource.save({ session });
  });
};

export const updateUserAccessService = async (resourceType, resourceId, userId, role, currentUserId) => {
  await runInTransaction(async (session) => {
    let Model = resourceType === "file" ? File : Directory;
    const resource = await Model.findById(resourceId).session(session);

    if (!resource) {
      throw new CustomError("Resource not found", 404);
    }

    if (resource.userId.toString() !== currentUserId.toString()) {
      throw new CustomError("Unauthorized", 403);
    }

    const share = resource.sharedWith.find(
      (s) => s.userId.toString() === userId.toString()
    );

    if (share) {
      share.role = role;
      await resource.save({ session });
    }
  });
};

export const removeUserAccessService = async (resourceType, resourceId, userId, currentUserId) => {
  await runInTransaction(async (session) => {
    let Model = resourceType === "file" ? File : Directory;
    const resource = await Model.findById(resourceId).session(session);

    if (!resource) {
      throw new CustomError("Resource not found", 404);
    }

    if (resource.userId.toString() !== currentUserId.toString()) {
      throw new CustomError("Unauthorized", 403);
    }

    resource.sharedWith = resource.sharedWith.filter(
      (s) => s.userId.toString() !== userId.toString()
    );

    await resource.save({ session });
  });
};

export const generateShareLinkService = async (resourceType, resourceId, role, currentUserId, origin) => {
  if (resourceType !== "file") {
    throw new CustomError("Only files can be shared", 400);
  }
  let Model = File;
  const resource = await Model.findById(resourceId);

  if (!resource) {
    throw new CustomError("Resource not found", 404);
  }

  if (resource.userId.toString() !== currentUserId.toString()) {
    throw new CustomError("Unauthorized", 403);
  }

  // Generate random token, cryptographically secure random string of 32 bytes
  const token = crypto.randomBytes(32).toString("hex");

  const linkUrl = `${origin}/shared/link/${token}`;

  resource.shareLink = {
    token,
    url: linkUrl,
    role: role || "viewer",
    enabled: true,
    createdAt: new Date(),
  };

  await resource.save();

  return { shareLink: resource.shareLink };
};

export const updateShareLinkService = async (resourceType, resourceId, role, currentUserId) => {
  let Model = resourceType === "file" ? File : Directory;
  const resource = await Model.findById(resourceId);

  if (!resource || resource.userId.toString() !== currentUserId.toString()) {
    throw new CustomError("Unauthorized or not found", 403);
  }

  if (resource.shareLink) {
    resource.shareLink.role = role;
    await resource.save();
  }
};

export const disableShareLinkService = async (resourceType, resourceId, currentUserId) => {
  let Model = resourceType === "file" ? File : Directory;
  const resource = await Model.findById(resourceId);

  if (!resource || resource.userId.toString() !== currentUserId.toString()) {
    throw new CustomError("Unauthorized or not found", 403);
  }

  resource.shareLink = undefined;
  await resource.save();
};

export const getDashboardStatsService = async (currentUserId) => {
  // 1. Shared With Me (Counts)
  const sharedWithMeCount = await File.countDocuments({
    "sharedWith.userId": currentUserId,
  });
  const sharedFoldersCount = await Directory.countDocuments({
    "sharedWith.userId": currentUserId,
  });

  // 2. Shared By Me (Counts)
  const sharedByMeCount = await File.countDocuments({
    userId: currentUserId,
    "sharedWith.0": { $exists: true },
  });
  const sharedFoldersByMeCount = await Directory.countDocuments({
    userId: currentUserId,
    "sharedWith.0": { $exists: true },
  });

  // 3. Collaborators (Bidirectional)
  const collaborators = new Set();

  // A. Peope I shared with (Receivers)
  const myFiles = await File.find({
    userId: currentUserId,
    "sharedWith.0": { $exists: true },
  }).select("sharedWith.userId");
  myFiles.forEach((f) =>
    f.sharedWith.forEach((s) => collaborators.add(s.userId.toString()))
  );

  // B. People who shared with me (Senders)
  const filesSharedWithMe = await File.find({
    "sharedWith.userId": currentUserId,
  }).select("userId");
  filesSharedWithMe.forEach((f) => {
    if (f.userId) collaborators.add(f.userId.toString());
  });

  return {
    sharedWithMe: sharedWithMeCount + sharedFoldersCount,
    sharedByMe: sharedByMeCount + sharedFoldersByMeCount,
    collaborators: collaborators.size,
  };
};

export const getRecentActivityService = async (currentUserId) => {
  // Get recent files shared WITH me
  const files = await File.find({ "sharedWith.userId": currentUserId })
    .sort({ "sharedWith.sharedAt": -1 })
    .limit(5)
    .populate("userId", "name");

  return files.map((f) => ({
    id: f._id,
    text: `Shared "${f.name}" with you`,
    date:
      f.sharedWith.find(
        (s) => s.userId.toString() === currentUserId.toString()
      )?.sharedAt || f.createdAt,
    user: f.userId.name,
  }));
};

export const getSharedWithMeService = async (currentUserId) => {
  // 1. Find Files
  const sharedFiles = await File.find({
    "sharedWith.userId": currentUserId,
  })
    .populate("userId", "name email picture")
    .lean();

  // 2. Find Folders
  const sharedFolders = await Directory.find({
    "sharedWith.userId": currentUserId,
  })
    .populate("userId", "name email picture")
    .lean();

  // 3. Format Files for Frontend
  const formattedFiles = sharedFiles.map((file) => {
    const myShare = file.sharedWith.find(
      (s) => s.userId.toString() === currentUserId.toString()
    );

    return {
      fileId: file._id,
      fileName: file.name,
      fileType: "file",
      size: file.size,
      sharedBy: file.userId?.name || "Unknown",
      sharedAt: myShare ? myShare.sharedAt : file.createdAt,
      permission: myShare ? myShare.role : "viewer",
    };
  });

  // 4. Format Folders for Frontend
  const formattedFolders = sharedFolders.map((folder) => {
    const myShare = folder.sharedWith.find(
      (s) => s.userId.toString() === currentUserId.toString()
    );

    return {
      fileId: folder._id,
      fileName: folder.name,
      fileType: "directory",
      size: folder.size,
      sharedBy: folder.userId?.name || "Unknown",
      sharedAt: myShare ? myShare.sharedAt : folder.createdAt,
      permission: myShare ? myShare.role : "viewer",
    };
  });

  // 5. Combine and Sort
  return [...formattedFiles, ...formattedFolders].sort(
    (a, b) => new Date(b.sharedAt) - new Date(a.sharedAt)
  );
};

export const getSharedByMeService = async (currentUserId) => {
  // Find files shared by me
  const files = await File.find({
    userId: currentUserId,
    "sharedWith.0": { $exists: true },
  })
    .populate("sharedWith.userId", "name email picture")
    .lean();

  // Find folders shared by me
  const folders = await Directory.find({
    userId: currentUserId,
    "sharedWith.0": { $exists: true },
  })
    .populate("sharedWith.userId", "name email picture")
    .lean();

  const formattedFiles = files.map((f) => ({
    fileId: f._id,
    fileName: f.name,
    fileType: "file",
    size: f.size,
    sharedWith: f.sharedWith.map((s) => ({
      userId: s.userId?._id,
      name: s.userId?.name || "Unknown",
      email: s.userId?.email,
      role: s.role,
    })),
    sharedAt: f.createdAt,
    permission: "editor", // I am owner
  }));

  const formattedFolders = folders.map((f) => ({
    fileId: f._id,
    fileName: f.name,
    fileType: "directory",
    size: f.size,
    sharedWith: f.sharedWith.map((s) => ({
      userId: s.userId?._id,
      name: s.userId?.name || "Unknown",
      email: s.userId?.email,
      role: s.role,
    })),
    sharedAt: f.createdAt,
    permission: "editor",
  }));

  return [...formattedFiles, ...formattedFolders].sort(
    (a, b) => new Date(b.sharedAt) - new Date(a.sharedAt)
  );
};

export const getPublicSharedResourceService = async (token) => {
  // 1. Search in Files
  let resource = await File.findOne({
    "shareLink.token": token,
    "shareLink.enabled": true,
  }).populate("userId", "name email");

  let resourceType = "file";

  if (!resource) {
    throw new CustomError("Link invalid or disabled", 404);
  }

  // 3. Generate Signed URLs
  let downloadUrl = null;
  let previewUrl = null;

  if (resourceType === "file") {
    const s3Key = `${resource._id}${resource.extension}`;
    try {
      // Preview: Use CloudFront (Faster, Inline)
      previewUrl = createCloudFrontSignedGetUrl({
        key: s3Key,
        filename: resource.name,
        disposition: 'inline'
      });

      // Download: Use Direct S3 (User requested fallback)
      downloadUrl = await getFileUrl({
        Key: s3Key,
        download: true,
        filename: resource.name,
      });
    } catch (urlErr) {
      console.error("Error generating signed URL:", urlErr);
    }
  }

  // 4. Determine MIME type from extension
  const extension = resource.extension
    ? resource.extension.toLowerCase().replace(".", "")
    : "";
  const isImage = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "bmp",
    "pdf"
  ].includes(extension);

  const mimeType = isImage
    ? `image/${extension}`
    : "application/octet-stream";

  return {
    _id: resource._id,
    name: resource.name,
    fileType: "file",
    mimeType: mimeType,
    size: resource.size,
    owner: resource.userId,
    createdAt: resource.createdAt,
    downloadUrl: downloadUrl, // S3 Signed URL
    previewUrl: previewUrl,   // CloudFront Signed URL
    role: resource.shareLink.role,
  };
};
