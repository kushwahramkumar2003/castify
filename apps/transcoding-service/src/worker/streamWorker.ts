import { mkdir, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import type { StreamStartedEvent, TranscodingState, QualityLabel } from "@castify/types";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import { FfmpegProcess } from "../ffmpeg/process.ts";
import { SegmentWatcher } from "../watcher/segmentWatcher.ts";
import { resolveProfiles, buildMasterPlaylist } from "../profiles.ts";
import { publishSegmentReady } from "../kafka/producer.ts";

// =============================================================================
// StreamWorker — manages the full lifecycle of ONE stream's transcoding job
// =============================================================================
//
//                         ┌───────────────────────────────────┐
//   Kafka stream.started  │              STATE MACHINE         │
//   ─────────────────────▶│                                    │
//                         │  IDLE → STARTING → TRANSCODING    │
//                         │          │              │          │
//                         │    error │              │ stream.ended / ffmpeg crash
//                         │          ▼              ▼          │
//                         │        ERROR ←── STOPPING → DONE  │
//                         └───────────────────────────────────┘
//
// WorkerPool creates one StreamWorker per stream.started event.
// WorkerPool calls worker.stop() when stream.ended arrives.
//
// TEMP DIRECTORY LAYOUT (cleaned up on DONE):
//   /tmp/castify-transcoding/<instanceId>/<streamKey>/
//     720p/  index.m3u8  seg00001.ts  seg00002.ts ...
//     480p/  ...
//     360p/  ...
// =============================================================================

export class StreamWorker {
  state: TranscodingState = "IDLE";
  readonly startedAt = new Date();
  readonly qualities: QualityLabel[];

  private ffmpegProcess: FfmpegProcess | null = null;
  private segmentWatcher: SegmentWatcher | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private tempDir: string;
  private segmentsUploaded = 0;
  private readonly profiles = resolveProfiles(config.FFMPEG_QUALITIES);

  constructor(private readonly event: StreamStartedEvent) {
    this.qualities = this.profiles.map((p) => p.label);
    // Temp dir: /private/tmp/castify-transcoding/<instanceId>/<streamKey>
    // The instance ID is only used as a namespace on the same host — the
    // actual path is published in Kafka events so hls-packager can find it.
    this.tempDir = join(config.TEMP_DIR, config.INSTANCE_ID, event.streamKey);
  }

  // ---------------------------------------------------------------------------
  // start() — prepare filesystem, write master playlist, launch FFmpeg
  // ---------------------------------------------------------------------------
  async start(): Promise<void> {
    this.state = "STARTING";
    const { streamKey, streamId, userId } = this.event;

    logger.info(
      { streamId, streamKey: `${streamKey.slice(0, 8)}…`, qualities: this.qualities },
      "StreamWorker starting"
    );

    try {
      // 1. Create temp directories for each quality tier
      await Promise.all(
        this.profiles.map((p) => mkdir(join(this.tempDir, p.label), { recursive: true }))
      );

      // 2. Publish a "master" segment ready event so hls-packager knows
      //    to upload the master playlist and start watching
      const masterPlaylist = buildMasterPlaylist(this.profiles);
      void publishSegmentReady({
        streamId,
        userId,
        streamKey,
        quality:    this.qualities[0]!,
        segmentIndex: -1,                     // -1 = master playlist, not a real segment
        localSegmentPath:   "",               // not a real segment
        localPlaylistPath:  "",
        segmentKey: `live/${streamKey}/master.m3u8`,
        durationMs: 0,
        timestamp:  new Date().toISOString(),
        isFinal:    false,
        isMaster:   true,
        masterPlaylist,
      });
      logger.info({ streamKey: `${streamKey.slice(0, 8)}…` }, "Master playlist event published");

      // 3. Wait for RTMP stream to stabilize, then build FFmpeg command
      //
      //    nginx fires on_publish the moment OBS TCP-connects, but video
      //    frames can take 0.5-2s to arrive after that. FFmpeg needs the
      //    stream to be actively publishing or it times out immediately.
      //    A short delay guarantees frames are flowing before FFmpeg connects.
      await new Promise((r) => setTimeout(r, 2_000));

      const rtmpUrl = `${config.NGINX_RTMP_URL}/${config.NGINX_RTMP_APP}/${streamKey}`;
      const ffmpegOpts = {
        rtmpUrl,
        tempDir: this.tempDir,
        profiles: this.profiles,
      };

      this.ffmpegProcess = new FfmpegProcess(ffmpegOpts, streamKey);

      this.ffmpegProcess.events.on("ffmpeg-error", (err: Error) => {
        logger.error({ err, streamKey: `${streamKey.slice(0, 8)}…` }, "FFmpeg error — marking worker as ERROR");
        this.state = "ERROR";
      });

      this.ffmpegProcess.events.on("end", () => {
        if (this.state !== "STOPPING" && this.state !== "DONE") {
          // FFmpeg ended on its own (stream died from OBS side without on_publish_done)
          logger.warn({ streamKey: `${streamKey.slice(0, 8)}…` }, "FFmpeg ended unexpectedly — cleaning up");
          void this.cleanup(false);
        }
      });

      // 4. Start the segment watcher BEFORE FFmpeg so we don't miss the first segment
      this.segmentWatcher = new SegmentWatcher(
        this.tempDir,
        streamKey,
        this.profiles,
        ({ quality, segmentIndex, localSegmentPath, localPlaylistPath }) => {
          this.segmentsUploaded++;

          const segmentKey = `live/${streamKey}/${quality}/${basename(localSegmentPath)}`;

          // Publish video.segment.ready Kafka event — hls-packager will upload
          void publishSegmentReady({
            streamId,
            userId,
            streamKey,
            quality: quality as QualityLabel,
            segmentIndex,
            localSegmentPath,
            localPlaylistPath,
            segmentKey,
            durationMs: config.HLS_SEGMENT_SECONDS * 1000,
            timestamp: new Date().toISOString(),
            isFinal: false,
            isMaster: false,
          });
        }
      );
      this.segmentWatcher.start();

      // 5. Launch FFmpeg
      this.ffmpegProcess.start();
      this.state = "TRANSCODING";

      // 6. Heartbeat — log progress every 30 s so the terminal shows activity
      //    (individual segment uploads are logged at debug level to avoid noise)
      this.heartbeat = setInterval(() => {
        if (this.state !== "TRANSCODING") return;
        const elapsedMs  = Date.now() - this.startedAt.getTime();
        const elapsedSec = Math.floor(elapsedMs / 1000);
        const mm = Math.floor(elapsedSec / 60).toString().padStart(2, "0");
        const ss = (elapsedSec % 60).toString().padStart(2, "0");
        const perQuality = this.segmentWatcher?.countsPerQuality() ?? {};

        logger.info(
          {
            streamKey:        `${streamKey.slice(0, 8)}…`,
            segmentsUploaded: this.segmentsUploaded,
            elapsed:          `${mm}:${ss}`,
            perQuality,
          },
          "⚡ Transcoding heartbeat"
        );
      }, 30_000);

      logger.info(
        { streamId, streamKey: `${streamKey.slice(0, 8)}…`, rtmpUrl },
        "✅ StreamWorker TRANSCODING"
      );
    } catch (err) {
      this.state = "ERROR";
      logger.error({ err, streamKey: `${streamKey.slice(0, 8)}…` }, "StreamWorker failed to start");
      await this.cleanup(false);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // stop() — graceful shutdown on stream.ended Kafka event
  // ---------------------------------------------------------------------------
  async stop(): Promise<void> {
    if (this.state === "DONE" || this.state === "STOPPING") return;
    this.state = "STOPPING";

    logger.info(
      { streamKey: `${this.event.streamKey.slice(0, 8)}…`, segmentsUploaded: this.segmentsUploaded },
      "StreamWorker stopping"
    );

    await this.cleanup(true);
    this.state = "DONE";
  }

  // ---------------------------------------------------------------------------
  // cleanup() — stop FFmpeg, stop watcher, remove temp dir
  // ---------------------------------------------------------------------------
  private async cleanup(graceful: boolean): Promise<void> {
    // 0. Stop heartbeat
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }

    // 1. Stop FFmpeg (SIGINT → EXT-X-ENDLIST → exit)
    if (this.ffmpegProcess?.isRunning()) {
      await this.ffmpegProcess.stop();
    }

    // 2. Stop the file watcher
    await this.segmentWatcher?.stop();

    // 3. Remove temp dir after a short delay — hls-packager may still be
    //    processing Kafka events for the last segments. 5 seconds gives
    //    the Kafka consumer time to pick up and process inflight events.
    //    After the delay, remaining files are hls-packager's responsibility.
    setTimeout(async () => {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // Non-fatal
      }
    }, 5_000);

    if (graceful) {
      logger.info(
        { streamKey: `${this.event.streamKey.slice(0, 8)}…`, segmentsUploaded: this.segmentsUploaded },
        "StreamWorker cleanup complete"
      );
    }
  }

  // ── Metrics for /health and WorkerPool ─────────────────────────────────────
  getSegmentsUploaded(): number { return this.segmentsUploaded; }
  getStreamKey(): string        { return this.event.streamKey; }
  getStreamId(): string         { return this.event.streamId; }
}
