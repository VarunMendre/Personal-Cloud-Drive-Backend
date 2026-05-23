import { importFromGoogleDrive } from "../services/googleDriveService.js";
import { successResponse } from "../utils/response.js";
import asyncHandler from "../utils/asyncHandler.js";
import { CustomError } from "../utils/CustomError.js";

export const importGoogleDrive = asyncHandler(async (req, res) => {
  const { fileId, accessToken, parentDirId } = req.body;

  try {
    const newFile = await importFromGoogleDrive({
      fileId,
      accessToken,
      parentDirId,
      user: req.user,
    });

    return successResponse(res, { success: true, file: newFile });
  } catch (error) {
    throw new CustomError(
      error.message || "Failed to import file from Google Drive",
      error.statusCode || 500,
      { details: error.details }
    );
  }
});
