import express from "express";
import checkAuth, { checkUploadAccess } from "../middlewares/authMiddleware.js";
import { importFromGoogleDrive } from "../services/googleDriveService.js";
import { successResponse, errorResponse } from "../utils/response.js";

const router = express.Router();

router.post("/google-drive", checkAuth, checkUploadAccess, async (req, res) => {
  try {
    const { fileId, accessToken, parentDirId } = req.body;

    const newFile = await importFromGoogleDrive({
      fileId,
      accessToken,
      parentDirId,
      user: req.user,
    });

    return successResponse(res, { success: true, file: newFile });
  } catch (error) {
    return errorResponse(
      res,
      error.message || "Failed to import file from Google Drive",
      error.statusCode || 500,
      { details: error.details }
    );
  }
});

export default router;
