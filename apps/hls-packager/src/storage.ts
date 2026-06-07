import { Client } from "minio";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { config } from "./config.ts";
import { logger } from "./logger.ts";

const minioClient = new Client({
  endPoint: config.STORAGE_ENDPOINT,
  port: config.STORAGE_PORT,
  useSSL: config.STORAGE_USE_SSL,
  accessKey: config.STORAGE_ACCESS_KEY,
  secretKey: config.STORAGE_SECRET_KEY,
  region: config.STORAGE_REGION,
});

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(config.STORAGE_BUCKET);
  if (!exists) {
    await minioClient.makeBucket(config.STORAGE_BUCKET);
    logger.info({ bucket: config.STORAGE_BUCKET }, "Storage bucket created");
  }
}

export async function uploadSegment(
  localPath: string,
  objectKey: string
): Promise<void> {
  const fileSize = (await stat(localPath)).size;
  const stream = createReadStream(localPath);
  await minioClient.putObject(
    config.STORAGE_BUCKET,
    objectKey,
    stream,
    fileSize
  );
  logger.debug({ objectKey, size: fileSize }, "Segment uploaded");
}

export async function uploadPlaylist(
  content: string,
  objectKey: string
): Promise<void> {
  const buf = Buffer.from(content, "utf-8");
  await minioClient.putObject(
    config.STORAGE_BUCKET,
    objectKey,
    buf,
    buf.length,
    {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    }
  );
  logger.debug({ objectKey }, "Playlist uploaded");
}

export async function uploadPlaylistFromDisk(
  localPath: string,
  objectKey: string
): Promise<void> {
  const content = await readFile(localPath, "utf-8");
  await uploadPlaylist(content, objectKey);
}
