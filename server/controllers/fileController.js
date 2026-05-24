import {
  deleteFileSchema,
  getFileSchema,
  renameFileSchema,
} from "../validators/fileSchema.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateWithSchema } from "../utils/validationWrapper.js";
import asyncHandler from "../utils/asyncHandler.js";
import { CustomError } from "../utils/CustomError.js";
import {
  getFileService,
  renameFileService,
  deleteFileService,
  getFileDetailsService,
  uploadFileInitiateService,
  completeFileUploadService,
  cancelFileUploadService,
} from "../services/file/fileService.js";

export const getFile = asyncHandler(async (req, res) => {
  const { success, data } = validateWithSchema(getFileSchema, { fileId: req.params.id });

  if (!success) {
    throw new CustomError("invalid File Id", 400);
  }

  const { fileId } = data;

  const getUrl = await getFileService(fileId, req.user._id, req.query.action);

  if (req.query.json === "true") {
    return successResponse(res, { url: getUrl });
  }

  return res.redirect(getUrl);
});

export const renameFile = asyncHandler(async (req, res) => {
  const { success, data } = validateWithSchema(renameFileSchema, {
    fileId: req.params.id,
    newFilename: req.body.newFilename,
    userId: req.user._id.toString(),
    version: req.body.version,
  });

  if (!success) {
    throw new CustomError("Invalid request: check file ID, filename characters, or version", 400);
  }
  const { fileId, newFilename, userId, version } = data;

  const shareToken = req.query.shareToken || req.headers['x-share-token'];

  await renameFileService(fileId, newFilename, userId, version, shareToken);

  return successResponse(res, null, "Renamed");
});

export const deleteFile = asyncHandler(async (req, res) => {
  const { success, data } = validateWithSchema(deleteFileSchema, {
    fileId: req.params.id,
    userId: req.user._id.toString(),
  });

  if (!success) {
    throw new CustomError("Invalid Id's", 400);
  }

  const { fileId, userId } = data;

  await deleteFileService(fileId, userId);

  return successResponse(res, null, "File Deleted Successfully");
});

export const getFileDetails = asyncHandler(async (req, res) => {
  const result = await getFileDetailsService(req.params.id, req.user._id);
  return successResponse(res, result);
});

export const uploadFileInitiate = asyncHandler(async (req, res) => {
  const { name, size, contentType, parentDirId } = req.body;

  if (!name || size <= 0 || !contentType) {
    throw new CustomError("to upload file req body need specified info", 400);
  }

  const result = await uploadFileInitiateService(req.body, req.user);

  return successResponse(res, result);
});

export const completeFileUpload = asyncHandler(async (req, res) => {
  const { fileId } = req.body;

  const result = await completeFileUploadService(fileId, req.user._id);

  return successResponse(res, result);
});

export const cancelFileUpload = asyncHandler(async (req, res) => {
  const { fileId } = req.body;

  if (!fileId) {
    throw new CustomError("File ID is required", 400);
  }

  await cancelFileUploadService(fileId, req.user._id);

  return successResponse(res, null, "Upload cancelled successfully");
});
