import User from "../models/userModel.js";
import File from "../models/fileModel.js";
import { deletes3Files } from "../services/s3.js";
import { updateDirectorySize } from "../utils/updateDirectorySize.js";

// Function 1: Only resets the storage limits (Called on Day 3/Halt)
export const resetUserToDefault = async (userId) => {
    const user = await User.findById(userId);
    if (!user) return;

    // Reset limits
    user.maxStorageLimit = 524288000; // 500MB
    user.maxDevices = 1;
    user.maxFileSize = 104857600; // 100MB
    await user.save();
    console.log(`[Limits] Reset to default for user ${userId}`);
};

// Function 2: Deletes the actual subscription-only files from DB and S3 (Called on Day 4/Cancel)
export const deleteSubscriptionFiles = async (userId) => {
    try {
        const subscriptionFiles = await File.find({ userId, haveSubscription: true });

        if (subscriptionFiles.length > 0) {
            const s3Keys = subscriptionFiles.map((file) => ({
                Key: file.extension ? `${file._id}${file.extension}` : `${file._id}`
            }));

            await deletes3Files(s3Keys);

            const dirUpdates = {};
            for (const file of subscriptionFiles) {
                const dirId = file.parentDirId.toString();
                dirUpdates[dirId] = (dirUpdates[dirId] || 0) + file.size;
            }

            for (const [dirId, totalSize] of Object.entries(dirUpdates)) {
                await updateDirectorySize(dirId, -totalSize);
            }

            const deletedResult = await File.deleteMany({ userId, haveSubscription: true });
            console.log(`[Cleanup] Deleted ${deletedResult.deletedCount} subscription files for user ${userId}`);
        } else {
            console.log(`[Cleanup] No subscription files found for user ${userId}`);
        }
    } catch (error) {
        console.error(`[Cleanup] Error deleting subscription files for user ${userId}:`, error.message);
    }
};