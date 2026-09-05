import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "us-east-1";

// Only pass static credentials when both are actually configured (local dev).
// Passing empty strings would override the SDK's default provider chain and
// break the EC2 instance profile the deployed orchestrator relies on.
const staticCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

export const s3Client = new S3Client({
  region,
  ...(staticCredentials ? { credentials: staticCredentials } : {}),
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || "gridnode-artifacts";

export async function generatePutUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType });
  return getSignedUrl(s3Client, command, { expiresIn: 900 }); // Valid for 15 mins
}

export async function generateGetUrl(key: string, filename?: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ...(filename
      ? {
          ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
        }
      : {}),
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 }); // Valid for 1 hour
}
