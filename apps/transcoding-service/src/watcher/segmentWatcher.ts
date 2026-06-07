import { watch, type FSWatcher } from "chokidar";
import { basename, dirname, join } from "node:path";
import { logger } from "../logger.ts";
import type { QualityProfile } from "../profiles.ts";

// =============================================================================
// SegmentWatcher
// =============================================================================
// Watches the per-stream temp directory for new .ts files that FFmpeg writes.
//
// This is a PURE watcher — no storage I/O, no MinIO, no S3.  Its sole job is
// to detect when FFmpeg finishes writing a new HLS segment and notify the
// onSegmentReady callback.  The callback (in StreamWorker) publishes a Kafka
// event that hls-packager consumes.
//
// HOW FFmpeg WRITES FILES (the temp_file flag):
//   1. FFmpeg encodes a 2-second segment → writes to seg00042.ts.tmp
//   2. Encoding completes → atomically renames .tmp → seg00042.ts
//   3. chokidar fires 'add' for seg00042.ts (the final, complete file)
//
// This atomic rename is why we use 'add' events and not 'change' — we never
// see a partially-written segment.  Without temp_file, chokidar might fire
// 'add' while FFmpeg is still writing.
// =============================================================================

export interface SegmentReadyInfo {
  quality: string;          // "720p" / "1080p" / …
  segmentIndex: number;     // parsed from filename: seg00042 → 42
  localSegmentPath: string; // /private/tmp/.../<quality>/seg00042.ts
  localPlaylistPath: string; // /private/tmp/.../<quality>/index.m3u8
}

export type SegmentReadyCallback = (info: SegmentReadyInfo) => void;

export class SegmentWatcher {
  private watcher: FSWatcher | null = null;
  private segmentCounts: Map<string, number> = new Map(); // quality → count

  constructor(
    private readonly tempDir: string,
    private readonly streamKey: string,
    private readonly profiles: QualityProfile[],
    private readonly onSegmentReady: SegmentReadyCallback,
  ) {}

  start(): void {
    const watchPaths = this.profiles.map((p) => join(this.tempDir, p.label));

    this.watcher = watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: false,
      usePolling:   true,
      interval:     500,
      binaryInterval: 500,
      ignored: (path: string) => {
        const b = path.split("/").at(-1) ?? "";
        return b.startsWith(".") || b.endsWith(".tmp");
      },
    });

    this.watcher.on("add", (filePath: string) => {
      if (!filePath.endsWith(".ts")) return;
      void this.handleNewSegment(filePath);
    });

    this.watcher.on("error", (err: unknown) => {
      logger.error(
        { err, streamKey: `${this.streamKey.slice(0, 8)}…` },
        "SegmentWatcher error",
      );
    });

    logger.info(
      { streamKey: `${this.streamKey.slice(0, 8)}…`, watching: watchPaths },
      "SegmentWatcher started",
    );
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleNewSegment(filePath: string): Promise<void> {
    const quality = basename(dirname(filePath));
    const filename = basename(filePath);

    const match = filename.match(/seg(\d+)\.ts$/);
    if (!match) return;
    const segmentIndex = parseInt(match[1]!, 10);

    const playlistPath = join(dirname(filePath), "index.m3u8");

    const count = (this.segmentCounts.get(quality) ?? 0) + 1;
    this.segmentCounts.set(quality, count);

    // Notify the callback — no storage I/O here.  The callback publishes
    // a Kafka event with localPaths so hls-packager can pick them up.
    this.onSegmentReady({
      quality,
      segmentIndex,
      localSegmentPath:  filePath,
      localPlaylistPath: playlistPath,
    });
  }

  totalSegments(): number {
    return [...this.segmentCounts.values()].reduce((a, b) => a + b, 0);
  }

  countsPerQuality(): Record<string, number> {
    return Object.fromEntries(this.segmentCounts.entries());
  }
}
