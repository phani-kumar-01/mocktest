import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const region = process.env.AWS_REGION || 'us-east-2';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
export const STORAGE_BUCKET = process.env.NEON_STORAGE_BUCKET || 'assets';

export const isStorageAvailable = Boolean(endpoint && accessKeyId && secretAccessKey);

export const s3 = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || ''
  },
  forcePathStyle: true // Mandatory for Neon Object Storage
});

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string = 'application/octet-stream',
  bucket: string = STORAGE_BUCKET
): Promise<{ key: string; bucket: string }> {
  if (!isStorageAvailable) {
    throw new Error('Neon Object Storage is not configured (missing AWS_* env vars)');
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof body === 'string' ? Buffer.from(body) : body,
      ContentType: contentType
    })
  );

  return { key, bucket };
}

export async function getObject(
  key: string,
  bucket: string = STORAGE_BUCKET
): Promise<Buffer | null> {
  if (!isStorageAvailable) return null;

  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

export async function deleteObject(
  key: string,
  bucket: string = STORAGE_BUCKET
): Promise<boolean> {
  if (!isStorageAvailable) return false;

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function listObjects(
  prefix: string = '',
  bucket: string = STORAGE_BUCKET
): Promise<string[]> {
  if (!isStorageAvailable) return [];

  const res = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix
    })
  );

  return (res.Contents || []).map(c => c.Key || '').filter(Boolean);
}
