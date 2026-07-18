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

export async function downloadPlaylistText(
  objectKey: string
): Promise<string | null> {
  try {
    const stream = await minioClient.getObject(config.STORAGE_BUCKET, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "NoSuchKey" || code === "NotFound") return null;
    logger.warn({ err, objectKey }, "downloadPlaylistText failed");
    return null;
  }
}

/** List .ts basenames under a prefix (e.g. live/<key>/720p/) */
export async function listSegmentBasenames(
  prefix: string
): Promise<Set<string>> {
  const names = new Set<string>();
  const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
  for await (const obj of minioClient.listObjectsV2(
    config.STORAGE_BUCKET,
    p,
    true
  )) {
    if (!obj.name) continue;
    const base = obj.name.split("/").pop() ?? "";
    if (base.endsWith(".ts")) names.add(base);
  }
  return names;
}

export async function uploadPlaylistFromDisk(
  localPath: string,
  objectKey: string,
  options?: { finalize?: boolean; merge?: boolean; discontinuity?: boolean }
): Promise<void> {
  const incoming = await readFile(localPath, "utf-8");
  let content = incoming;
  let keepFinalized = options?.finalize === true;

  if (options?.merge !== false) {
    const { mergeHlsPlaylists, filterPlaylistToExistingSegs } = await import(
      "./playlistMerge.ts"
    );
    const existing = await downloadPlaylistText(objectKey);
    // Once a playlist was finalized for VOD, keep ENDLIST even if a late
    // segment upload would otherwise re-open it as a live EVENT playlist.
    const alreadyFinalized = !!existing?.includes("#EXT-X-ENDLIST");
    keepFinalized = keepFinalized || alreadyFinalized;
    content = mergeHlsPlaylists(existing, incoming, {
      finalize: keepFinalized,
      discontinuity: options?.discontinuity === true,
    });

    // Strip any playlist rows that point at missing objects (broken live edge)
    const slash = objectKey.lastIndexOf("/");
    const prefix = slash >= 0 ? objectKey.slice(0, slash + 1) : objectKey;
    const present = await listSegmentBasenames(prefix);
    const before = content;
    content = filterPlaylistToExistingSegs(content, present);
    if (content !== before) {
      logger.info(
        { objectKey, present: present.size },
        "Trimmed playlist entries for missing MinIO segments"
      );
    }
  } else if (options?.finalize) {
    // keepFinalized already true
  } else {
    content = content
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "#EXT-X-ENDLIST")
      .join("\n");
    if (!content.endsWith("\n")) content += "\n";
  }

  if (keepFinalized && !content.includes("#EXT-X-ENDLIST")) {
    content = content.trimEnd() + "\n#EXT-X-ENDLIST\n";
  }

  await uploadPlaylist(content, objectKey);
}
