import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3 Client initialization.
 * In AWS Lambda, the SDK automatically picks up the IAM Role credentials and Region.
 * For local development, it will look for AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in your .env.
 */
export const s3Client = new S3Client({});

export const createUploadSignedUrl = async ({ key, contentType }) => {
  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 300,
    signableHeaders: new Set(["content-type"]),
  });

  return url;
};

export const completeUploadCheck = async ({ filename }) => {
  const command = new ListObjectsV2Command({
    Bucket: process.env.BUCKET_NAME,
    Prefix: filename,
    MaxKeys: 1,
  });

  const result = await s3Client.send(command);

  // Check if file exists
  if (!result.Contents || result.Contents.length === 0) {
    throw new Error("File not found in S3");
  }

  const resultFileSize = result.Contents[0].Size;
  return resultFileSize;
};

export const getFileUrl = async ({ Key, download = false, filename }) => {
  const command = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: Key,
    ResponseContentDisposition: `${download ? "attachment" : "inline"}; filename=${encodeURIComponent(filename)}`,
  });
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 3600,
  });

  return url;
};

export const deletes3File = async (Key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: Key,
  });

  return await s3Client.send(command);
};

export const deletes3Files = async (keys) => {
  const command = new DeleteObjectsCommand({
    Bucket: process.env.BUCKET_NAME,
    Delete: {
      Objects: keys,
      Quiet: false,
    },
  });

  return await s3Client.send(command);
};