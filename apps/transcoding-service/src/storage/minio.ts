import { Client } from "minio";
import { config } from "../config.ts";
import { logger } from "../logger.ts";

// MinIO access for HLS continuity across OBS reconnects (same stream key).
// Segments live at: live/<streamKey>/<quality>/segXXXXX.ts
// Playlists live at: live/<streamKey>/<quality>/index.m3u8

const minioClient = new Client({
  endPoint: config.MINIO_ENDPOINT,
  port: config.MINIO_PORT,
  useSSL: config.MINIO_USE_SSL,
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

/**
 * Scan existing segment objects for a quality ladder and return the next
 * FFmpeg start number so reconnects do not overwrite prior clips.
 *
 * Object names: live/<streamKey>/<quality>/seg00042.ts → index 42
 */
export async function getNextSegmentStartNumber(
  streamKey: string,
  quality: string,
  bucket: string = config.MINIO_BUCKET
): Promise<number> {
  const prefix = `live/${streamKey}/${quality}/`;
  let maxIndex = -1;

  try {
    const stream = minioClient.listObjectsV2(bucket, prefix, true);
    for await (const obj of stream) {
      if (!obj.name) continue;
      const base = obj.name.split("/").pop() ?? "";
      const m = base.match(/^seg(\d+)\.ts$/i);
      if (!m) continue;
      const n = parseInt(m[1]!, 10);
      if (Number.isFinite(n) && n > maxIndex) maxIndex = n;
    }
  } catch (err) {
    logger.warn(
      { err, streamKey: `${streamKey.slice(0, 8)}…`, quality },
      "Could not list existing segments — starting from 0"
    );
    return 0;
  }

  const next = maxIndex + 1;
  if (next > 0) {
    logger.info(
      { streamKey: `${streamKey.slice(0, 8)}…`, quality, nextStart: next },
      "Resuming HLS segment numbering after prior session"
    );
  }
  return next;
}

/**
 * Download an existing quality playlist so FFmpeg can append_list onto it.
 * Strips EXT-X-ENDLIST so a reconnect can continue the same media playlist.
 */
export async function downloadPlaylistForAppend(
  streamKey: string,
  quality: string,
  bucket: string = config.MINIO_BUCKET
): Promise<string | null> {
  const objectKey = `live/${streamKey}/${quality}/index.m3u8`;
  try {
    const stream = await minioClient.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    let content = Buffer.concat(chunks).toString("utf-8");
    // Remove end marker so the session can continue after OBS reconnect
    content = content
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "#EXT-X-ENDLIST")
      .join("\n");
    if (!content.endsWith("\n")) content += "\n";
    return content;
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "NoSuchKey" || code === "NotFound") return null;
    logger.warn(
      { err, objectKey },
      "Failed to download existing playlist for append"
    );
    return null;
  }
}

/**
 * Permanent stream end — append #EXT-X-ENDLIST to each quality playlist so
 * hls.js treats the recording as VOD (free seek) instead of a live EVENT stream.
 * Without this, scrubbing to start/mid jumps back to the live edge (end).
 */
export async function finalizePlaylists(
  streamKey: string,
  qualities: string[],
  bucket: string = config.MINIO_BUCKET
): Promise<void> {
  for (const quality of qualities) {
    const objectKey = `live/${streamKey}/${quality}/index.m3u8`;
    try {
      const stream = await minioClient.getObject(bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      let content = Buffer.concat(chunks).toString("utf-8");
      if (!content.trim()) continue;

      // Mark as finished VOD (keep segments; do not strip history)
      if (!content.includes("#EXT-X-ENDLIST")) {
        content = content.trimEnd() + "\n#EXT-X-ENDLIST\n";
      }
      // Prefer VOD playlist type for players that key off it
      if (content.includes("#EXT-X-PLAYLIST-TYPE:EVENT")) {
        content = content.replace(
          /#EXT-X-PLAYLIST-TYPE:EVENT/g,
          "#EXT-X-PLAYLIST-TYPE:VOD"
        );
      } else if (!content.includes("#EXT-X-PLAYLIST-TYPE:")) {
        content = content.replace(
          /(#EXT-X-VERSION:\d+)/,
          "$1\n#EXT-X-PLAYLIST-TYPE:VOD"
        );
      }

      await minioClient.putObject(
        bucket,
        objectKey,
        Buffer.from(content, "utf-8"),
        content.length,
        { "Content-Type": "application/vnd.apple.mpegurl" }
      );
      logger.info(
        { objectKey, streamKey: `${streamKey.slice(0, 8)}…`, quality },
        "Finalized HLS playlist with EXT-X-ENDLIST for VOD"
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (code === "NoSuchKey" || code === "NotFound") {
        logger.warn(
          { objectKey: `live/${streamKey}/${quality}/index.m3u8` },
          "No playlist to finalize (quality never produced segments)"
        );
        continue;
      }
      logger.error(
        { err, streamKey: `${streamKey.slice(0, 8)}…`, quality },
        "Failed to finalize quality playlist"
      );
    }
  }
}

export { minioClient };
