import Directory from "../../models/directoryModel.js";
import File from "../../models/fileModel.js";
import { deletes3Files } from "../s3.js";
import { updateDirectorySize } from "../../utils/updateDirectorySize.js";
import { CustomError } from "../../utils/CustomError.js";

// Recursive function to count all nested files and folders
async function getRecursiveCounts(dirId) {
  const filesInDir = await File.find({ parentDirId: dirId }).lean();
  const subdirsInDir = await Directory.find({ parentDirId: dirId }).lean();
  
  let totalFiles = filesInDir.length;
  let totalFolders = subdirsInDir.length;
  
  // Recursively count in each subdirectory
  for (const subdir of subdirsInDir) {
    const counts = await getRecursiveCounts(subdir._id);
    totalFiles += counts.totalFiles;
    totalFolders += counts.totalFolders;
  }
  
  return { totalFiles, totalFolders };
}

export const getDirectoryService = async (id, userId) => {
  const directoryData = await Directory.findOne({
    _id: id,
    userId: userId,
  })
    .populate("path", "name")
    .lean();

  if (!directoryData) {
    throw new CustomError("Directory not found or you do not have access to it!", 404);
  }

  const files = await File.find({ parentDirId: directoryData._id }).lean();
  const directories = await Directory.find({ parentDirId: id }).lean();
  
  // Get recursive counts for this directory
  const { totalFiles, totalFolders } = await getRecursiveCounts(directoryData._id);
  
  return {
    ...directoryData,
    files: files.map((dir) => ({ ...dir, id: dir._id })),
    directories: directories.map((dir) => ({ ...dir, id: dir._id })),
    totalFiles,
    totalFolders,
  };
};

export const createDirectoryService = async (dirname, parentDirId, userId) => {
  // Ensures user can only create folders inside their own folders
  const parentDir = await Directory.findOne({
    _id: parentDirId,
    userId: userId,
  }).lean();

  if (!parentDir) {
    throw new CustomError("Parent Directory Does not exist!", 404);
  }

  const newPath = [...(parentDir.path || []), parentDir._id];
   
  await Directory.create({
    name: dirname,
    parentDirId,
    userId: userId,
    path: newPath,
  });
};

export const renameDirectoryService = async (dirId, newDirName, userId) => {
  const result = await Directory.findOneAndUpdate(
    {
      _id: dirId,
      userId: userId,
    },
    { name: newDirName }
  );

  if (!result) {
    throw new CustomError("Directory not found or not authorized to rename", 404);
  }
};

async function getDirectoryContents(id) {
  let files = await File.find({ parentDirId: id })
    .select("extension")
    .lean();
  let directories = await Directory.find({ parentDirId: id })
    .select("_id")
    .lean();

  for (const { _id } of directories) {
    const { files: childFiles, directories: childDirectories } =
      await getDirectoryContents(_id);

    files = [...files, ...childFiles];
    directories = [...directories, ...childDirectories];
  }

  return { files, directories };
}

export const deleteDirectoryService = async (dirId, userId) => {
  const directoryData = await Directory.findOne({
    _id: dirId,
    userId: userId,
  }).lean();

  if (!directoryData) {
    throw new CustomError("Directory not found!", 404);
  }

  const { files, directories } = await getDirectoryContents(dirId);

  const keys = files.map(({_id, extension}) => ({Key:`${_id}${extension}`}))

  if (keys.length > 0) {
    await deletes3Files(keys);
  }

  if (files.length > 0) {
    await File.deleteMany({
      _id: { $in: files.map(({ _id }) => _id) },
    });
  }

  await Directory.deleteMany({
    _id: { $in: [...directories.map(({ _id }) => _id), dirId] },
  });

  await updateDirectorySize(directoryData.parentDirId, -directoryData.size);
};
