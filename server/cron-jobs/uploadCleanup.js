import File from "../models/fileModel.js";
import { deletes3Files } from "../services/s3.js";
import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/response.js";

/**
 * Orphaned Uploads Cleanup
 * Deletes files that stayed in the "isUploading: true" state for more than 24 hours.
 * (This happens if a user starts an upload but the socket/browser crashes)
 */

export const cleanOrphanedUploads = asyncHandler(async (req, res, next) => {
    const twentyFourHoursAgo = new Date(Date.now() - 1000 * 60 * 60 * 24);
    const reports = {
        cleaned: 0,
        errors: 0,
    };

    // 1. Find the stalled uploads
    const orphanedFiles = await File.find({
        isUploading: true,
        createdAt: { $lt: twentyFourHoursAgo }
    });

    if (orphanedFiles.length > 0) {
        try {
            // 2. Prepare keys for S3 deletion
            const s3Keys = orphanedFiles.map((file) => ({
                Key: file.extension ? `${file._id}${file.extension}` : `${file._id.toString()}`
            }));

            // 3. Delete from S3
            await deletes3Files(s3Keys);

            // 4. Delete from DB
            const deleteResult = await File.deleteMany({
                _id: { $in: orphanedFiles.map(f => f._id) }
            });

            reports.cleaned = deleteResult.deletedCount;
            console.log(`[Cron] Purged ${reports.cleaned} orphaned uploads.`);
        } catch (error) {
            reports.errors++;
            console.error(`[Cron] Error purging uploads:`, error);
        }
    }

    return successResponse(res, reports, "Orphaned uploads cleanup processed successfully");
});