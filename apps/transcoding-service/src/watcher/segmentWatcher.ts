import { watch, type FSWatcher } from "chokidar";
import { basename, dirname, join } from "node:path";
import { logger } from "../logger.ts";
import { uploadSegment, uploadPlaylistFromDisk } from "../storage/minio.ts";
import type { QualityProfile } from "../profiles.ts";
import { config } from "../config.ts";

// =============================================================================
// SegmentWatcher
// =============================================================================
// Watches the per-stream temp directory for new .ts files that FFmpeg writes.
//
// HOW FFmpeg WRITES FILES (the temp_file flag):
//   1. FFmpeg encodes a 2-second segment → writes to seg00042.ts.tmp
//   2. Encoding completes → atomically renames .tmp → seg00042.ts
//   3. chokidar fires 'add' for seg00042.ts (the final, complete file)
//
// This atomic rename is why we use 'add' events and not 'change' — we never
// see a partially-written segment.  Without temp_file, chokidar might fire
// 'add' while FFmpeg is still writing, resulting in a corrupted upload.
//
// Per segment uploaded, we also re-upload the quality-level index.m3u8 so
// viewers always have an up-to-date playlist pointing to the latest segments.
//
// The onSegmentUploaded callback is used by StreamWorker to:
//   • count segments (for health metrics)
//   • publish video.segment.ready Kafka events
// =============================================================================

export type SegmentUploadedCallback = (opts: {
  quality: string;
  segmentKey: string;      // MinIO object key
  segmentIndex: number;    // Parsed from filename: seg00042.ts → 42
}) => void;

export class SegmentWatcher {
  private watcher: FSWatcher | null = null;
  private segmentCounts: Map<string, number> = new Map(); // quality → count

  constructor(
    private readonly tempDir: string,
    private readonly streamKey: string,
    private readonly profiles: QualityProfile[],
    private readonly onSegmentUploaded: SegmentUploadedCallback
  ) {}

  // ---------------------------------------------------------------------------
  // start() — begin watching all quality subdirectories
  // ---------------------------------------------------------------------------
  start(): void {
    // Watch the quality subdirs: /tmp/castify-transcoding/<id>/<key>/720p/ etc.
    //
    // IMPORTANT — macOS /tmp symlink:
    // On macOS, /tmp is a symlink → /private/tmp. chokidar's kqueue watcher
    // fires events with the REAL path (/private/tmp/...) but if we pass the
    // symlink path (/tmp/...) the filePath in the 'add' callback won't match
    // the .endsWith(".ts") filter because chokidar normalises to real paths.
    //
    // Fix: we set usePolling:true as a belt-and-suspenders measure. Polling
    // avoids kqueue entirely, making the code path identical on macOS/Linux.
    // At 500ms poll interval, a 2-second HLS segment is detected within 0.5s
    // of the atomic rename — well within acceptable latency.
    const watchPaths = this.profiles.map((p) => join(this.tempDir, p.label));

    this.watcher = watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,      // don't fire for files that already exist
      awaitWriteFinish: false,  // we rely on FFmpeg's atomic rename instead
      usePolling:   true,       // ← avoids macOS kqueue / /tmp symlink issues
      interval:     500,        // poll every 500ms (fine for 2s HLS segments)
      binaryInterval: 500,
      // Ignore dotfiles and .tmp files; only .ts and .m3u8 trigger events
      ignored: (path: string) => {
        const b = path.split("/").at(-1) ?? "";
        return b.startsWith(".") || b.endsWith(".tmp");
      },
    });

    this.watcher.on("add", (filePath: string) => {
      // Only process .ts files — ignore .m3u8 (we upload those in handleNewSegment)
      if (!filePath.endsWith(".ts")) return;
      void this.handleNewSegment(filePath);
    });

    this.watcher.on("error", (err: unknown) => {
      logger.error(
        { err, streamKey: `${this.streamKey.slice(0, 8)}…` },
        "SegmentWatcher error"
      );
    });

    logger.info(
      { streamKey: `${this.streamKey.slice(0, 8)}…`, watching: watchPaths },
      "SegmentWatcher started"
    );
  }

  // ---------------------------------------------------------------------------
  // stop() — close the watcher
  // ---------------------------------------------------------------------------
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  // ---------------------------------------------------------------------------
  // handleNewSegment — upload segment + updated playlist to MinIO
  // ---------------------------------------------------------------------------
  private async handleNewSegment(localPath: string): Promise<void> {
    const quality = basename(dirname(localPath)); // e.g. "720p"
    const filename = basename(localPath);         // e.g. "seg00042.ts"

    // Parse segment index from filename: seg00042 → 42
    const match = filename.match(/seg(\d+)\.ts$/);
    if (!match) return;
    const segmentIndex = parseInt(match[1]!, 10);

    // MinIO object key: live/<streamKey>/<quality>/seg00042.ts
    const segmentKey = `live/${this.streamKey}/${quality}/${filename}`;

    try {
      // 1. Upload the .ts file to MinIO
      await uploadSegment(localPath, segmentKey);

      // 2. Upload the updated quality-level index.m3u8 so viewers see new segment
      const playlistLocal = join(dirname(localPath), "index.m3u8");
      const playlistKey   = `live/${this.streamKey}/${quality}/index.m3u8`;
      await uploadPlaylistFromDisk(playlistLocal, playlistKey);

      // 3. Update count and notify the StreamWorker
      const count = (this.segmentCounts.get(quality) ?? 0) + 1;
      this.segmentCounts.set(quality, count);

      this.onSegmentUploaded({ quality, segmentKey, segmentIndex });

      logger.debug(
        { segmentKey, segmentIndex, quality },
        "Segment + playlist uploaded"
      );
    } catch (err) {
      logger.error({ err, localPath, segmentKey }, "Failed to upload segment");
      // Don't rethrow — a single failed segment upload shouldn't kill the stream
    }
  }

  // Total segments uploaded across all quality tracks
  totalSegments(): number {
    return [...this.segmentCounts.values()].reduce((a, b) => a + b, 0);
  }
}
