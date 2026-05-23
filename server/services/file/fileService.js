import mongoose from "mongoose";
import File from "../../models/fileModel.js";
import User from "../../models/userModel.js";
import Directory from "../../models/directoryModel.js";
import { resolveFilePath } from "../../utils/resolveFilePath.js";
import { updateDirectorySize } from "../../utils/updateDirectorySize.js";
import { createCloudFrontSignedGetUrl } from "../cloudFront.js";
import { completeUploadCheck, createUploadSignedUrl, deletes3File, getFileUrl } from "../s3.js";
import { runInTransaction } from "../../utils/transactionHelper.js";
import { CustomError } from "../../utils/CustomError.js";

export const getFileService = async (fileId, userId, action) => {
  // Fix IDOR on File Download
  const fileData = await File.findOne({
    _id: fileId,
    $or: [
      { userId: userId },
      { "sharedWith.userId": userId }
    ]
  });

  // Check if file exists
  if (!fileData) {
    throw new CustomError("File not found!", 404);
  }

  const s3Key = `${fileId}${fileData.extension}`;
  const isDownload = action === "download";
  let getUrl;

  if (isDownload) {
    getUrl = await getFileUrl({
      Key: s3Key,
      download: true,
      filename: fileData.name,
    });
  } else {
    getUrl = createCloudFrontSignedGetUrl({
      key: s3Key,
      filename: fileData.name,
    });
  }

  return getUrl;
};

export const renameFileService = async (fileId, newFilename, userId, version, shareToken) => {
  // Find the file 
  const file = await File.findById(fileId);

  // Check if file exists
  if (!file) {
    throw new CustomError("File not found!", 404);
  }
  // Optimistic locking check
  if (version !== undefined && file.__v !== version) {
    throw new CustomError("File has been modified by another user. Please refresh.", 409);
  }

  file.__v = (file.__v || 0) + 1;

  if (shareToken) {
    // Validate share link token and permissions
    if (!file.shareLink ||
      file.shareLink.token !== shareToken ||
      !file.shareLink.enabled) {
      throw new CustomError("Invalid or disabled share link", 403);
    }

    if (file.shareLink.role !== "editor") {
      throw new CustomError("Share link does not have editor permissions", 403);
    }
    // Share link is valid with editor permissions, allow rename
  } else {
    // Regular request - check if user is owner OR has editor permission
    const isOwner = file.userId.toString() === userId.toString();
    const hasEditorAccess = file.sharedWith.some(
      (share) => share.userId.toString() === userId.toString() && share.role === "editor"
    );

    if (!isOwner && !hasEditorAccess) {
      throw new CustomError("You don't have permission to rename this file", 403);
    }
  }

  file.name = newFilename;
  await file.save();
};

export const deleteFileService = async (fileId, userId) => {
  const file = await File.findOne({
    _id: fileId,
    userId: userId,
  });

  if (!file) {
    throw new CustomError("File not found!", 404);
  }

  await file.deleteOne();
  await updateDirectorySize(file.parentDirId, -file.size);
  await deletes3File(`${file.id}${file.extension}`);
};

export const getFileDetailsService = async (fileId, userId) => {
  const file = await File.findById(fileId);
  if (!file) {
    throw new CustomError("File not found", 404);
  }

  // Verify ownership or shared access
  const isOwner = file.userId.toString() === userId.toString();
  const isShared = file.sharedWith.some(
    (s) => s.userId.toString() === userId.toString()
  );

  if (!isOwner && !isShared) {
    throw new CustomError("Access denied", 403);
  }

  const result = await resolveFilePath(fileId);
  if (!result) {
    throw new CustomError("Error resolving path", 404);
  }
  return result;
};

export const uploadFileInitiateService = async (data, user) => {
  const { name, size, contentType, parentDirId } = data;

  const result = await runInTransaction(async (session) => {
    const actualParentDirId = parentDirId || user.rootDirId;
    const parentDir = await Directory.findById(actualParentDirId).session(session);

    if (!parentDir) {
      throw new CustomError("Parent directory not found", 400);
    }

    // parent directory belongs to user
    if (parentDir.userId.toString() !== user._id.toString()) {
      throw new CustomError("You don't have access to this directory", 403);
    }

    const rootDir = await Directory.findById(user.rootDirId).session(session);
    const fullUser = await User.findById(user._id).session(session);

    const availableSpace = fullUser.maxStorageLimit - rootDir.size;

    if (size > availableSpace) {
      throw new CustomError("Storage quota exceeded. Please delete some files or upgrade your plan.", 413);
    }

    if (size > fullUser.maxFileSize) {
      throw new CustomError(`File size exceeds the maximum limit of ${fullUser.maxFileSize / 1024 / 1024} MB for your current plan.`, 413);
    }

    const extension = name.includes(".")
      ? name.substring(name.lastIndexOf("."))
      : "";

    const haveSubscription = !!fullUser.subscriptionId;

    // Create file with session
    const [newFile] = await File.create([{
      name,
      size,
      contentType,
      extension,
      userId: fullUser._id,
      parentDirId: actualParentDirId,
      isUploading: true,
      haveSubscription,
    }], { session });

    return newFile;
  });

  const s3Key = `${result._id}${result.extension}`;

  const signedUrl = await createUploadSignedUrl({
    key: s3Key,
    contentType: contentType,
  });

  return { fileId: result._id, uploadUrl: signedUrl };
};

export const completeFileUploadService = async (fileId, userId) => {
  const file = await File.findById(fileId);

  if (!file) {
    throw new CustomError("File not found", 404);
  }

  // Verify ownership
  if (file.userId.toString() !== userId.toString()) {
    throw new CustomError("You don't have access to this file", 403);
  }

  const fullFileName = file.extension.startsWith(".")
    ? `${file._id}${file.extension}`
    : `${file._id}.${file.extension}`;

  let resultFileSize;
  try {
    resultFileSize = await completeUploadCheck({
      filename: fullFileName,
    });
  } catch (err) {
    throw new CustomError("Failed to verify file", 500);
  }

  if (file.size !== resultFileSize) {
    throw new CustomError("File sizes don't match", 412, { expected: file.size, actual: resultFileSize });
  }

  file.isUploading = false;
  await file.save();

  await updateDirectorySize(file.parentDirId, file.size);

  return { size: resultFileSize };
};

export const cancelFileUploadService = async (fileId, userId) => {
  const file = await File.findById(fileId);

  if (!file) {
    throw new CustomError("File not found", 404);
  }

  // Verify ownership
  if (file.userId.toString() !== userId.toString()) {
    throw new CustomError("You don't have access to this file", 403);
  }

  try {
    // Delete from S3
    const s3Key = `${file._id}${file.extension}`;
    await deletes3File(s3Key);
  } catch (err) {
    console.error("Error cancelling upload:", err);
    throw new CustomError("Failed to cancel upload", 500);
  }

  if (!file.isUploading) {
    await updateDirectorySize(file.parentDirId, -file.size);
  }

  await file.deleteOne();
};
