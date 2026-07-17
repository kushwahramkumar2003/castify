import { Client } from "minio";
import { randomUUID } from "node:crypto";
import { config } from "../config";

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: config.STORAGE_ENDPOINT,
      port: config.STORAGE_PORT,
      useSSL: config.STORAGE_USE_SSL,
      accessKey: config.STORAGE_ACCESS_KEY,
      secretKey: config.STORAGE_SECRET_KEY,
      region: config.STORAGE_REGION,
    });
  }
  return client;
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isAllowedImageType(mime: string): boolean {
  return ALLOWED.has(mime.toLowerCase());
}

/**
 * Upload a stream thumbnail to object storage.
 * Returns a public-facing URL (via nginx MinIO proxy when configured).
 */
export async function uploadStreamThumbnail(opts: {
  streamId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const { streamId, buffer, contentType } = opts;
  if (!isAllowedImageType(contentType)) {
    throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("Thumbnail must be 5 MB or smaller");
  }

  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
      ? "webp"
      : contentType === "image/gif"
      ? "gif"
      : "jpg";

  const objectKey = `thumbnails/${streamId}/${randomUUID()}.${ext}`;
  const c = getClient();
  const bucket = config.STORAGE_BUCKET;

  const exists = await c.bucketExists(bucket);
  if (!exists) {
    await c.makeBucket(bucket);
  }

  await c.putObject(bucket, objectKey, buffer, buffer.length, {
    "Content-Type": contentType,
  });

  const base = config.THUMBNAIL_PUBLIC_BASE.replace(/\/$/, "");
  return `${base}/${objectKey}`;
}
