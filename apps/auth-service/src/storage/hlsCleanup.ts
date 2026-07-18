import { Client } from "minio";
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

/**
 * Resolve MinIO/S3 object prefix from a stored VOD playlist URL/key.
 *
 * Objects live in bucket `hls-segments` (or STORAGE_BUCKET) as:
 *   live/<streamKey>/master.m3u8
 *   live/<streamKey>/<quality>/index.m3u8
 *   live/<streamKey>/<quality>/seg00000.ts
 *
 * DB often stores a proxy path including the bucket:
 *   hls-segments/live/<streamKey>/master.m3u8
 */
export function playlistUrlToObjectPrefix(
  playlistUrl: string | null | undefined
): string | null {
  if (!playlistUrl?.trim()) return null;

  let path = playlistUrl.trim();
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      path = new URL(path).pathname;
    }
  } catch {
    /* keep raw */
  }

  path = path.replace(/^\/+/, "");
  // Strip nginx /minio/ proxy prefix
  path = path.replace(/^minio\//i, "");
  // Strip bucket name when included in stored key
  const bucket = config.STORAGE_BUCKET.replace(/^\/+|\/+$/g, "");
  if (path.startsWith(`${bucket}/`)) {
    path = path.slice(bucket.length + 1);
  }
  // Alternate public bucket aliases
  for (const alias of ["hls-segments", "vod-archive"]) {
    if (alias !== bucket && path.startsWith(`${alias}/`)) {
      path = path.slice(alias.length + 1);
    }
  }

  // Drop filename (master.m3u8 / index.m3u8) → directory prefix
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  const prefix = path.slice(0, lastSlash + 1);
  // Quality playlist: live/KEY/720p/index.m3u8 → prefer live/KEY/ for full tree
  const parts = prefix.replace(/\/$/, "").split("/");
  if (parts[0] === "live" && parts.length >= 2) {
    return `live/${parts[1]}/`;
  }
  if (parts[0] === "vod-archive" && parts.length >= 2) {
    return `vod-archive/${parts[1]}/`;
  }
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

/** Prefix for a stream-key live tree in the HLS bucket. */
export function livePrefixForStreamKey(streamKey: string): string {
  return `live/${streamKey.replace(/^\/+|\/+$/g, "")}/`;
}

/** Prefix for stream thumbnails (auth-service uploads). */
export function thumbnailPrefixForStream(streamId: string): string {
  return `thumbnails/${streamId.replace(/^\/+|\/+$/g, "")}/`;
}

async function listObjectNames(
  bucket: string,
  prefix: string
): Promise<string[]> {
  const c = getClient();
  const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const names: string[] = [];
  const stream = c.listObjectsV2(bucket, p, true);
  for await (const obj of stream) {
    if (obj.name) names.push(obj.name);
  }
  return names;
}

async function removeObjectNames(
  bucket: string,
  names: string[]
): Promise<number> {
  if (names.length === 0) return 0;
  const c = getClient();
  let removed = 0;

  // MinIO removeObjects accepts { name } objects and is more reliable in bulk
  const chunkSize = 500;
  for (let i = 0; i < names.length; i += chunkSize) {
    const batch = names.slice(i, i + chunkSize);
    try {
      const result = await c.removeObjects(
        bucket,
        batch.map((name) => ({ name }))
      );
      // Some SDK versions return errors for failed keys only
      const failed =
        Array.isArray(result) && result.length > 0
          ? new Set(
              result
                .map((r) =>
                  r && typeof r === "object" && "name" in r
                    ? String((r as { name?: string }).name ?? "")
                    : ""
                )
                .filter(Boolean)
            )
          : new Set<string>();
      removed += batch.filter((n) => !failed.has(n)).length;

      // If removeObjects is a no-op / unexpected shape, fall back per-object
      if (removed === 0 && batch.length > 0 && !Array.isArray(result)) {
        for (const name of batch) {
          try {
            await c.removeObject(bucket, name);
            removed += 1;
          } catch {
            /* ignore single */
          }
        }
      }
    } catch {
      for (const name of batch) {
        try {
          await c.removeObject(bucket, name);
          removed += 1;
        } catch {
          /* ignore single */
        }
      }
    }
  }

  return removed;
}

export type StorageCleanupResult = {
  removed: number;
  prefixes: string[];
  errors: string[];
};

/**
 * Delete all HLS (+ optional thumbnail) objects for a recording from MinIO/S3.
 * Collects every object under each resolved prefix and removes them in bulk.
 */
export async function deleteRecordingStorage(opts: {
  playlistUrl?: string | null;
  streamKeys?: string[];
  streamId?: string | null;
  thumbnailUrl?: string | null;
}): Promise<StorageCleanupResult> {
  const bucket = config.STORAGE_BUCKET;
  const prefixes = new Set<string>();
  const errors: string[] = [];

  const fromPlaylist = playlistUrlToObjectPrefix(opts.playlistUrl);
  if (fromPlaylist) prefixes.add(fromPlaylist);

  for (const key of opts.streamKeys ?? []) {
    if (key?.trim()) prefixes.add(livePrefixForStreamKey(key.trim()));
  }

  if (opts.streamId?.trim()) {
    prefixes.add(thumbnailPrefixForStream(opts.streamId.trim()));
  }

  // Thumbnail URL may live under thumbnails/ or an absolute public URL
  if (opts.thumbnailUrl?.trim()) {
    const t = playlistUrlToObjectPrefix(opts.thumbnailUrl);
    // playlistUrlToObjectPrefix drops file → dir; for a single file use parent
    if (t) prefixes.add(t);
    else {
      // Single object path without trailing dir
      let path = opts.thumbnailUrl.trim();
      try {
        if (path.startsWith("http")) path = new URL(path).pathname;
      } catch {
        /* keep */
      }
      path = path.replace(/^\/+/, "").replace(/^minio\//i, "");
      const b = config.STORAGE_BUCKET;
      if (path.startsWith(`${b}/`)) path = path.slice(b.length + 1);
      if (path.startsWith("thumbnails/")) {
        const last = path.lastIndexOf("/");
        if (last > 0) prefixes.add(path.slice(0, last + 1));
      }
    }
  }

  if (prefixes.size === 0) {
    return { removed: 0, prefixes: [], errors: [] };
  }

  let removed = 0;
  const usedPrefixes: string[] = [];

  // Verify bucket is reachable; surface real config issues
  try {
    const c = getClient();
    const exists = await c.bucketExists(bucket);
    if (!exists) {
      errors.push(`Storage bucket "${bucket}" does not exist`);
      return { removed: 0, prefixes: [...prefixes], errors };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Storage unreachable: ${msg}`);
    console.error(
      `[auth-service] MinIO/S3 connect failed (endpoint=${config.STORAGE_ENDPOINT}:${config.STORAGE_PORT})`,
      err
    );
    return { removed: 0, prefixes: [...prefixes], errors };
  }

  for (const prefix of prefixes) {
    usedPrefixes.push(prefix);
    try {
      const names = await listObjectNames(bucket, prefix);
      if (names.length === 0) {
        console.info(
          `[auth-service] storage cleanup: no objects under ${bucket}/${prefix}`
        );
        continue;
      }
      const n = await removeObjectNames(bucket, names);
      removed += n;
      console.info(
        `[auth-service] storage cleanup: removed ${n}/${names.length} objects under ${bucket}/${prefix}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed prefix ${prefix}: ${msg}`);
      console.error(
        `[auth-service] storage cleanup failed for ${bucket}/${prefix}`,
        err
      );
    }
  }

  return { removed, prefixes: usedPrefixes, errors };
}

/** @deprecated use deleteRecordingStorage */
export async function deleteHlsObjectsForPlaylist(
  playlistUrl: string | null | undefined
): Promise<{ removed: number; prefix: string | null }> {
  const r = await deleteRecordingStorage({ playlistUrl });
  return {
    removed: r.removed,
    prefix: r.prefixes[0] ?? null,
  };
}
