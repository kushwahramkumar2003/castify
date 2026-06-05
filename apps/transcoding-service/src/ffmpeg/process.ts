import { EventEmitter } from "node:events";
import type ffmpeg from "fluent-ffmpeg";
import { logger } from "../logger.ts";

// =============================================================================
// FfmpegProcess — lifecycle wrapper around a running FFmpeg command
// =============================================================================
// Wraps fluent-ffmpeg's event model and exposes a clean Promise-based API.
//
// Design: we use an internal EventEmitter (not extending it) to avoid type
// conflicts between fluent-ffmpeg's strict overloaded .on() signature and
// Node's generic EventEmitter events (particularly "error").
//
// Events emitted on .events:
//   'progress'  — periodic progress update from FFmpeg stderr
//   'ffmpeg-error' — FFmpeg exited with an error
//   'end'       — FFmpeg exited cleanly (stream ended or SIGINT sent)
// =============================================================================

export interface FfmpegProgress {
  frames: number;
  fps: number;
  bitrateKbps: number;
  timemark: string; // "00:01:32.5"
}

export class FfmpegProcess {
  // Separate EventEmitter avoids type conflicts with fluent-ffmpeg's overloads
  readonly events = new EventEmitter();

  private readonly command: ffmpeg.FfmpegCommand;
  private running = false;
  private readonly streamKey: string;

  constructor(command: ffmpeg.FfmpegCommand, streamKey: string) {
    this.command = command;
    this.streamKey = streamKey;
  }

  // ---------------------------------------------------------------------------
  // start() — attach FFmpeg event listeners and kick off encoding
  // ---------------------------------------------------------------------------
  start(): void {
    if (this.running) return;
    this.running = true;

    this.command
      .on("start", (cmdLine: string) => {
        logger.info(
          { streamKey: `${this.streamKey.slice(0, 8)}…`, cmdPreview: cmdLine.slice(0, 120) },
          "FFmpeg process started"
        );
      })
      .on("progress", (progress: { frames: number; currentFps: number; currentKbps: number; timemark: string }) => {
        this.events.emit("progress", {
          frames: progress.frames,
          fps: progress.currentFps,
          bitrateKbps: progress.currentKbps,
          timemark: progress.timemark,
        } satisfies FfmpegProgress);
      })
      .on("stderr", (line: string) => {
        logger.info({ streamKey: `${this.streamKey.slice(0, 8)}…`, line }, "FFmpeg stderr");
      })
      .on("end", () => {
        this.running = false;
        logger.info({ streamKey: `${this.streamKey.slice(0, 8)}…` }, "FFmpeg process ended cleanly");
        this.events.emit("end");
      })
      .on("error", (err: Error) => {
        this.running = false;
        // Distinguish intentional stops from real errors.
        // FFmpeg outputs "Exiting normally, received signal 2." (SIGINT = signal 2)
        // NOT the word "SIGINT". Also handle SIGKILL ("signal 9") and "killed".
        const isIntentionalStop =
          err.message.includes("signal 2")       ||  // SIGINT from our stop()
          err.message.includes("signal 9")       ||  // SIGKILL from our force-kill
          err.message.includes("Exiting normally") || // FFmpeg's SIGINT message
          err.message.includes("SIGINT")         ||  // some fluent-ffmpeg versions
          err.message.includes("killed");             // SIGKILL alternate wording

        if (isIntentionalStop) {
          logger.info({ streamKey: `${this.streamKey.slice(0, 8)}…` }, "FFmpeg stopped by signal");
          this.events.emit("end");
        } else {
          logger.error({ streamKey: `${this.streamKey.slice(0, 8)}…`, err }, "FFmpeg process error");
          this.events.emit("ffmpeg-error", err);
        }
      });

    this.command.run();
  }

  // ---------------------------------------------------------------------------
  // stop() — gracefully terminate FFmpeg (SIGINT → EXT-X-ENDLIST → exit)
  // ---------------------------------------------------------------------------
  stop(timeoutMs = 8_000): Promise<void> {
    return new Promise((resolve) => {
      if (!this.running) { resolve(); return; }

      const cleanup = () => { clearTimeout(forceKill); resolve(); };
      this.events.once("end", cleanup);
      this.events.once("ffmpeg-error", cleanup);

      try {
        this.command.kill("SIGINT");
      } catch {
        resolve();
        return;
      }

      const forceKill = setTimeout(() => {
        logger.warn({ streamKey: `${this.streamKey.slice(0, 8)}…` }, "FFmpeg SIGKILL (timeout)");
        try { this.command.kill("SIGKILL"); } catch { /* gone */ }
        resolve();
      }, timeoutMs);
    });
  }

  isRunning(): boolean { return this.running; }
}
