import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { logger } from "../logger.ts";
import { buildFfmpegArgs, getFfmpegPath } from "./builder.ts";
import type { FfmpegCommandArgs } from "./builder.ts";

// =============================================================================
// FfmpegProcess — lifecycle wrapper around a raw child_process.spawn() call
// =============================================================================
// WHY child_process.spawn() INSTEAD OF fluent-ffmpeg:
//   fluent-ffmpeg v2.x has a multi-output bug where -map options bleed across
//   outputs when combined with -filter_complex.  Only the LAST output in the
//   chain produces segments; all others get wrong mappings.
//
//   By using spawn() we have full control over the exact argument array and
//   can verify the command in the logs.
//
// Events emitted on .events:
//   'progress'     — periodic progress update from FFmpeg stderr
//   'ffmpeg-error' — FFmpeg exited with a non-zero code that is NOT a signal
//   'end'          — FFmpeg exited cleanly (stream finished or SIGINT sent)
// =============================================================================

export interface FfmpegProgress {
  frames: number;
  fps: number;
  bitrateKbps: number;
  timemark: string;
}

export class FfmpegProcess {
  readonly events = new EventEmitter();

  private proc: ChildProcess | null = null;
  private running = false;
  private readonly streamKey: string;
  private readonly opts: FfmpegCommandArgs;
  private stderrBuf = "";  // accumulate partial lines

  constructor(opts: FfmpegCommandArgs, streamKey: string) {
    this.opts = opts;
    this.streamKey = streamKey;
  }

  // ---------------------------------------------------------------------------
  // start() — spawn FFmpeg and wire up stdout/stderr handlers
  // ---------------------------------------------------------------------------
  start(): void {
    if (this.running) return;
    this.running = true;

    const { args, cmdString } = buildFfmpegArgs(this.opts);
    const ffmpegBin = getFfmpegPath();

    // Log the COMPLETE command (not truncated) so you can reproduce it manually
    logger.info(
      {
        streamKey: `${this.streamKey.slice(0, 8)}…`,
        cmd:       cmdString,
      },
      "FFmpeg process starting"
    );

    this.proc = spawn(ffmpegBin, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    // ── stderr line reader ──────────────────────────────────────────────────
    this.proc.stderr!.setEncoding("utf8");
    this.proc.stderr!.on("data", (chunk: string) => {
      this.stderrBuf += chunk;
      let nl: number;
      while ((nl = this.stderrBuf.indexOf("\n")) !== -1) {
        const line = this.stderrBuf.slice(0, nl).trimEnd();
        this.stderrBuf = this.stderrBuf.slice(nl + 1);
        this.handleStderrLine(line);
      }
    });

    // ── exit handler ─────────────────────────────────────────────────────────
    this.proc.on("close", (code, signal) => {
      this.running = false;

      const isIntentionalStop =
        signal === "SIGINT"  ||
        signal === "SIGTERM" ||
        signal === "SIGKILL" ||
        // FFmpeg writes "Exiting normally, received signal N." to stderr
        // before closing; catch it by exit code too
        code === 0 ||
        code === 255; // FFmpeg exits 255 on SIGINT in some builds

      if (isIntentionalStop || signal != null) {
        logger.info(
          { streamKey: `${this.streamKey.slice(0, 8)}…`, code, signal },
          "FFmpeg stopped"
        );
        this.events.emit("end");
      } else {
        const err = new Error(`FFmpeg exited with code ${code}`);
        logger.error(
          { streamKey: `${this.streamKey.slice(0, 8)}…`, code, signal },
          "FFmpeg exited with error"
        );
        this.events.emit("ffmpeg-error", err);
      }
    });

    this.proc.on("error", (err) => {
      this.running = false;
      logger.error(
        { streamKey: `${this.streamKey.slice(0, 8)}…`, err },
        "FFmpeg spawn error"
      );
      this.events.emit("ffmpeg-error", err);
    });
  }

  // ---------------------------------------------------------------------------
  // handleStderrLine — parse FFmpeg's stderr output
  // ---------------------------------------------------------------------------
  private handleStderrLine(line: string): void {
    if (!line) return;
    const low = line.toLowerCase();

    // Progress lines contain "frame=" and "fps=" — parse them
    if (line.startsWith("frame=")) {
      const frames    = parseInt(line.match(/frame=\s*(\d+)/)?.[1] ?? "0");
      const fps       = parseFloat(line.match(/fps=\s*([\d.]+)/)?.[1] ?? "0");
      const kbps      = parseFloat(line.match(/bitrate=\s*([\d.]+)/)?.[1] ?? "0");
      const timemark  = line.match(/time=\s*([\d:.]+)/)?.[1] ?? "0:00:00.0";
      this.events.emit("progress", { frames, fps, bitrateKbps: kbps, timemark } satisfies FfmpegProgress);
      return; // don't log progress lines (very frequent)
    }

    // Log everything else (codec info, errors, warnings, segment open/close)
    const level =
      low.includes("error") || low.includes("invalid") || low.includes("failed")
        ? "error"
        : low.includes("warn")
          ? "warn"
          : "debug"; // use debug for routine HLS muxer lines

    if (level === "error") {
      logger.error({ streamKey: `${this.streamKey.slice(0, 8)}…`, line }, "FFmpeg error");
    } else if (level === "warn") {
      logger.warn({ streamKey: `${this.streamKey.slice(0, 8)}…`, line }, "FFmpeg warn");
    } else {
      // Log at debug so it doesn't flood info logs but IS visible with LOG_LEVEL=debug
      logger.debug({ streamKey: `${this.streamKey.slice(0, 8)}…`, line }, "FFmpeg");
    }
  }

  // ---------------------------------------------------------------------------
  // stop() — send SIGINT for graceful shutdown (FFmpeg writes EXT-X-ENDLIST)
  // ---------------------------------------------------------------------------
  stop(timeoutMs = 8_000): Promise<void> {
    return new Promise((resolve) => {
      if (!this.running || !this.proc) { resolve(); return; }

      const cleanup = () => { clearTimeout(forceKill); resolve(); };
      this.events.once("end", cleanup);
      this.events.once("ffmpeg-error", cleanup);

      // SIGINT finalizes the last open segment. With omit_endlist in hls_flags,
      // FFmpeg will NOT write EXT-X-ENDLIST so OBS can reconnect and append.
      this.proc.kill("SIGINT");

      const forceKill = setTimeout(() => {
        logger.warn({ streamKey: `${this.streamKey.slice(0, 8)}…` }, "FFmpeg SIGKILL (timeout)");
        this.proc?.kill("SIGKILL");
        resolve();
      }, timeoutMs);
    });
  }

  isRunning(): boolean { return this.running; }
}
