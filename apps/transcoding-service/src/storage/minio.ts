import { Client } from "minio";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { config } from "../config.ts";
import { logger } from "../logger.ts";

const minioClient = new Client({
  endPoint:  config.MINIO_ENDPOINT,
  port:      config.MINIO_PORT,
  useSSL:    config.MINIO_USE_SSL,
  accessKey: config.MINIO_ACCESS_KEY,
  secretKey: config.MINIO_SECRET_KEY,
});

export async function ensureBucket(bucket: string = config.MINIO_BUCKET): Promise<void> {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket);
    logger.info({ bucket }, "MinIO bucket created");
  }
}

export async function uploadSegment(
  localPath: string,
  objectKey: string,
  bucket: string = config.MINIO_BUCKET
): Promise<void> {
  const stream = createReadStream(localPath);
  await minioClient.putObject(bucket, objectKey, stream);
  logger.debug({ objectKey }, "Segment uploaded to MinIO");
}

// =============================================================================
// uploadText — write a playlist file (master.m3u8 / index.m3u8) to MinIO
// =============================================================================
// Called when:
//   a) Stream starts → upload master.m3u8
//   b) A new segment is ready → upload the updated quality-level index.m3u8
//   c) Stream ends → upload final playlists with #EXT-X-ENDLIST
// =============================================================================
export async function uploadText(
  content: string,
  objectKey: string,
  bucket: string = config.MINIO_BUCKET
): Promise<void> {
  const buf = Buffer.from(content, "utf-8");
  await minioClient.putObject(bucket, objectKey, buf, buf.length, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  logger.debug({ objectKey }, "Playlist uploaded to MinIO");
}

// =============================================================================
// uploadPlaylistFromDisk — read a local .m3u8 and upload it verbatim
// =============================================================================
// FFmpeg writes and manages the quality-level index.m3u8 files.  After each
// segment write, the watcher reads the updated playlist from disk and uploads
// it to MinIO so viewers always have the latest segment list.
// =============================================================================
export async function uploadPlaylistFromDisk(
  localPath: string,
  objectKey: string,
  bucket: string = config.MINIO_BUCKET
): Promise<void> {
  const content = await readFile(localPath, "utf-8");
  await uploadText(content, objectKey, bucket);
}

// =============================================================================
// getPublicUrl — construct the MinIO/CDN URL for a given object
// =============================================================================
export function getPublicUrl(objectKey: string): string {
  const scheme = config.MINIO_USE_SSL ? "https" : "http";
  const port   = config.MINIO_PORT !== 80 && config.MINIO_PORT !== 443
    ? `:${config.MINIO_PORT}`
    : "";
  return `${scheme}://${config.MINIO_ENDPOINT}${port}/${config.MINIO_BUCKET}/${objectKey}`;
}

export { minioClient };
