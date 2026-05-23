import {
  createDirectorySchema,
  deleteDirectorySchema,
  getDirectorySchema,
  renameDirectorySchema,
} from "../validators/directorySchema.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { validateWithSchema } from "../utils/validationWrapper.js";
import asyncHandler from "../utils/asyncHandler.js";
import { CustomError } from "../utils/CustomError.js";
import {
  getDirectoryService,
  createDirectoryService,
  renameDirectoryService,
  deleteDirectoryService,
} from "../services/directory/directoryService.js";

export const getDirectory = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new CustomError("Unauthorized. Please log in first.", 401);
  }
  const _id = req.params.id || user.rootDirId.toString();

  const { success, data, error } = validateWithSchema(getDirectorySchema, { id: _id });

  if (!success) {
    throw new CustomError(error, 400);
  }

  const { id } = data;
  
  const directoryData = await getDirectoryService(id, req.user._id);
  
  return successResponse(res, directoryData);
});

export const createDirectory = asyncHandler(async (req, res) => {
  const user = req.user;

  const parentDirId = req.params.parentDirId || user.rootDirId.toString();
  const dirname = req.headers.dirname || "New Folder";

  const { success, data } = validateWithSchema(createDirectorySchema, {
    parentDirId: parentDirId,
    dirname: dirname,
  });

  if (!success) {
    throw new CustomError("Invalid Directory details while creation", 400);
  }

  try {
    await createDirectoryService(dirname, parentDirId, user._id);
    return successResponse(res, null, "Directory Created!", 201);
  } catch (err) {
    if (err.code === 121) {
      throw new CustomError("Invalid input, please enter valid details", 400);
    }
    throw err;
  }
});

export const renameDirectory = asyncHandler(async (req, res) => {
  const user = req.user;

  const { success, data } = validateWithSchema(renameDirectorySchema, {
    dirId: req.params.id,
    newDirName: req.body.newDirName,
  });

  if (!success) {
    throw new CustomError("Invalid Details of Directory while rename", 400);
  }

  const { dirId, newDirName } = data;

  await renameDirectoryService(dirId, newDirName, user._id);
  return successResponse(res, null, "Directory Renamed!");
});

export const deleteDirectory = asyncHandler(async (req, res) => {
  const { success, data } = validateWithSchema(deleteDirectorySchema, {
    dirId: req.params.id,
  });

  if (!success) {
    throw new CustomError("Directory Id not found", 400);
  }
  const { dirId } = data;

  await deleteDirectoryService(dirId, req.user._id);
  
  return successResponse(res, null, "Files deleted successfully");
});
