import { google } from "googleapis";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client } from "./s3.js";
import Directory from "../models/directoryModel.js";
import File from "../models/fileModel.js";
import User from "../models/userModel.js";
import { updateDirectorySize } from "../utils/updateDirectorySize.js";
import { CustomError } from "../utils/CustomError.js";

/**
 * Imports a file from Google Drive to S3
 * @param {Object} params - The import parameters
 * @param {string} params.fileId - The Google Drive file ID
 * @param {string} params.accessToken - The Google Drive access token
 * @param {string} params.parentDirId - The parent directory ID in Storage App
 * @param {Object} params.user - The user object from request
 * @returns {Promise<Object>} - The created file record
 */
export const importFromGoogleDrive = async ({ fileId, accessToken, parentDirId, user: reqUser }) => {
  if (!fileId || !accessToken) {
    throw new CustomError("Missing fileId or accessToken", 400);
  }

  // Validate access token format
  if (typeof accessToken !== "string" || accessToken.length < 10) {
    throw new CustomError("Invalid access token format", 400);
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  try {
    // 1. Get file metadata
    const meta = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size",
    });

    const originalName = meta.data.name;
    const mimeType = meta.data.mimeType;
    let fileSize = meta.data.size ? parseInt(meta.data.size) : 0;

    let driveStream;
    let contentType = mimeType;
    let extension = originalName.includes(".")
      ? originalName.substring(originalName.lastIndexOf("."))
      : "";
    let finalFilename = originalName;

    // 2. Handle Google Docs vs Binary Files
    if (mimeType.startsWith("application/vnd.google-apps.")) {
      // It's a Google Doc, we need to export it
      let exportMimeType;
      if (mimeType === "application/vnd.google-apps.document") {
        exportMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        extension = ".docx";
        contentType = exportMimeType;
      } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
        exportMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        extension = ".xlsx";
        contentType = exportMimeType;
      } else if (mimeType === "application/vnd.google-apps.presentation") {
        exportMimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        extension = ".pptx";
        contentType = exportMimeType;
      } else {
        exportMimeType = "application/pdf";
        extension = ".pdf";
        contentType = "application/pdf";
      }

      finalFilename = originalName.endsWith(extension) ? originalName : `${originalName}${extension}`;

      const response = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: "stream" }
      );
      driveStream = response.data;
    } else {
      // Binary file
      const response = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" }
      );
      driveStream = response.data;
    }

    // Ensure extension has dot if it exists
    if (extension && !extension.startsWith(".")) {
      extension = "." + extension;
    }

    const user = await User.findById(reqUser._id);
    if (!user) {
      throw new CustomError("User not found", 404);
    }

    if (fileSize > user.maxFileSize) {
      throw new CustomError(`File size exceeds the maximum limit of ${user.maxFileSize / 1024 / 1024} MB for your current plan.`, 413);
    }

    const rootDir = await Directory.findById(reqUser.rootDirId);
    if (!rootDir) {
      throw new CustomError("Root directory not found", 404);
    }

    // QUOTA CHECK
    const availableSpace = user.maxStorageLimit - rootDir.size;
    if (fileSize > availableSpace) {
      throw new CustomError("Storage quota exceeded.", 413);
    }

    const haveSubscription = !!user.subscriptionId;
    const newFile = new File({
      name: finalFilename,
      size: fileSize || 0,
      extension: extension,
      userId: user._id,
      parentDirId: parentDirId || reqUser.rootDirId,
      isUploading: true,
      haveSubscription,
    });

    // 4. Create S3 Key
    const key = `${newFile._id}${extension}`;

    // 5. Upload to S3
    const parallelUploads3 = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.BUCKET_NAME,
        Key: key,
        Body: driveStream,
        ContentType: contentType,
      },
    });

    await parallelUploads3.done();

    // 6. Finalize File Record
    newFile.isUploading = false;
    await newFile.save();

    // 7. Update Directory Size
    if (newFile.parentDirId) {
      await updateDirectorySize(newFile.parentDirId, newFile.size);
    }

    return newFile;
  } catch (error) {
    if (error instanceof CustomError) throw error;

    // Handle Google Drive specific errors
    let errorMessage = "Failed to import file from Google Drive";
    let statusCode = 500;

    if (
      error.code === 401 ||
      error.message?.includes("invalid_grant") ||
      error.message?.includes("Invalid Credentials")
    ) {
      errorMessage = "Invalid or expired Google Drive access token. Please try authenticating again.";
      statusCode = 401;
    } else if (
      error.code === 403 ||
      error.message?.includes("insufficient permissions")
    ) {
      errorMessage = "Insufficient permissions to access this file. Please grant the required permissions.";
      statusCode = 403;
    } else if (
      error.code === 404 ||
      error.message?.includes("File not found")
    ) {
      errorMessage = "File not found in Google Drive. It may have been deleted or you don't have access.";
      statusCode = 404;
    } else if (error.message?.includes("quota")) {
      errorMessage = "Google Drive API quota exceeded. Please try again later.";
      statusCode = 429;
    }

    throw new CustomError(errorMessage, statusCode, { details: error.message });
  }
};
