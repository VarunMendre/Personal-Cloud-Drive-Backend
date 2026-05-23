import express from "express";
import checkAuth, { checkUploadAccess } from "../middlewares/authMiddleware.js";
import { importGoogleDrive } from "../controllers/importController.js";

const router = express.Router();

router.post("/google-drive", checkAuth, checkUploadAccess, importGoogleDrive);

export default router;
