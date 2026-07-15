import { join } from "node:path";
import type { QualityProfile } from "../profiles.ts";
import { config } from "../config.ts";

// =============================================================================
// buildFfmpegArgs
// =============================================================================
// Builds a RAW FFmpeg argument array for multi-quality HLS output.
//
// WHY NOT FLUENT-FFMPEG FOR MULTIPLE OUTPUTS:
//   fluent-ffmpeg v2.x has a bug where output options (especially -map) bleed
//   across multiple .addOutput() chains when combined with -filter_complex.
//   The result is that only the LAST output in the chain produces segments —
//   all previous outputs get wrong or missing mappings.
//
//   By building the args array ourselves we have 100% control over the exact
//   command that executes.  The generated command is logged in full at startup
//   so you can verify it in the service logs.
//
// ARCHITECTURE (single FFmpeg process, multiple outputs):
//
//   RTMP input
//       │
//       ▼
//   [0:v] split=N ──┬── [v0] scale → 1080p ──► encode ──► HLS segments
//                   ├── [v1] scale → 720p  ──► encode ──► HLS segments
//                   ├── [v2] scale → 480p  ──► encode ──► HLS segments
//                   └── [v3] scale → 360p  ──► encode ──► HLS segments
//
//   Audio is muxed with each video output independently (aac, stereo).
// =============================================================================

export interface FfmpegCommandArgs {
  rtmpUrl: string;      // rtmp://localhost:1935/live/<stream-key>
  tempDir: string;      // /private/tmp/castify-transcoding/<instanceId>/<streamKey>
  profiles: QualityProfile[];
  /**
   * Per-quality first segment index (default 0).
   * On OBS reconnect this continues from max(existing MinIO segs)+1 so prior
   * clips are not overwritten.
   */
  startNumbers?: Record<string, number>;
  /**
   * When true, FFmpeg uses append_list so new segs are added to an existing
   * local index.m3u8 (seeded from MinIO on reconnect).
   */
  appendExisting?: boolean;
}

/**
 * Returns the FFmpeg binary path from config (falls back to system ffmpeg).
 */
export function getFfmpegPath(): string {
  return config.FFMPEG_PATH;
}

/**
 * Build a complete FFmpeg argument array for multi-quality HLS encoding.
 * Returns { args: string[], cmdString: string } for logging and spawning.
 */
export function buildFfmpegArgs(opts: FfmpegCommandArgs): { args: string[]; cmdString: string } {
  const { rtmpUrl, tempDir, profiles, startNumbers = {}, appendExisting = false } = opts;
  const n = profiles.length;

  // ── Filter complex ─────────────────────────────────────────────────────────
  // [0:v]split=N[v0][v1]...[vN-1]
  // [v0]scale=W:H:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v0out]
  // ...
  //
  // force_original_aspect_ratio=decrease: never upscale (if source is 720p,
  // asking for 1080p gives 720p). The second scale pass ensures even pixel
  // dimensions (required by yuv420p / H.264 Main Profile).
  const splitOutputs = profiles.map((_, i) => `[v${i}]`).join("");
  const splitFilter  = `[0:v]split=${n}${splitOutputs}`;
  const scaleFilters = profiles.map(
    (p, i) =>
      `[v${i}]scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,` +
      `scale=trunc(iw/2)*2:trunc(ih/2)*2[v${i}out]`
  );
  const filterComplex = [splitFilter, ...scaleFilters].join(";");

  // ── Build args array ────────────────────────────────────────────────────────
  // The args are ordered exactly as FFmpeg expects:
  //   [global] [input options] -i <url> -filter_complex <...> \
  //   [output0 options] <output0 file> \
  //   [output1 options] <output1 file> \
  //   ...
  //
  // CRITICAL: each output's options must come BEFORE its output file path,
  // and must not contaminate the next output's options.  When building manually
  // (vs fluent-ffmpeg) we guarantee this layout.
  const args: string[] = [
    // ── Global ──────────────────────────────────────────────────────────────
    "-y",                         // overwrite output files without asking

    // ── Input options ────────────────────────────────────────────────────────
    // -rw_timeout: socket I/O timeout in microseconds (30 seconds).
    //   Use -rw_timeout NOT -timeout (which implies -rtmp_listen 1 = server mode).
    "-rw_timeout", "30000000",

    // Input URL
    "-i", rtmpUrl,

    // ── Filter complex ───────────────────────────────────────────────────────
    "-filter_complex", filterComplex,
  ];

  // ── One output block per quality profile ───────────────────────────────────
  for (let i = 0; i < profiles.length; i++) {
    const p      = profiles[i]!;
    const outDir = join(tempDir, p.label);
    const gopSize = p.frameRate * 2; // 2-second GOP matches HLS segment duration
    const startNumber = startNumbers[p.label] ?? 0;

    // HLS flags:
    //   independent_segments — each .ts decodes standalone (ABR)
    //   temp_file            — atomic rename so chokidar never sees partial segs
    //   omit_endlist         — OBS disconnect must NOT finalize the playlist;
    //                          session stays open so reconnect can append
    //   append_list          — on reconnect, extend the seeded index.m3u8
    // NOTE: do NOT use delete_segments — packager/MinIO own retention
    const hlsFlags = appendExisting
      ? "independent_segments+temp_file+omit_endlist+append_list"
      : "independent_segments+temp_file+omit_endlist";

    args.push(
      // Video stream mapping — the scaled, labelled output from filter_complex
      "-map",          `[v${i}out]`,
      // Audio stream mapping — re-encode per output; '?' = skip if no audio
      "-map",          "0:a?",

      // ── Video codec ───────────────────────────────────────────────────────
      "-c:v",          "libx264",
      "-b:v",          `${p.videoBitrateKbps}k`,
      "-maxrate",      `${p.maxVideoBitrateKbps}k`,
      "-bufsize",      `${p.bufSizeKbps}k`,
      "-preset",       config.FFMPEG_PRESET,
      "-profile:v",   "main",
      "-level:v",     "4.0",
      "-sc_threshold", "0",
      "-g",            String(gopSize),
      "-keyint_min",   String(p.frameRate),
      "-r",            String(p.frameRate),
      "-pix_fmt",      "yuv420p",

      // ── Audio codec ───────────────────────────────────────────────────────
      "-c:a",          "aac",
      "-b:a",          `${p.audioBitrateKbps}k`,
      "-ac",           "2",
      "-ar",           "44100",

      // ── HLS muxer ─────────────────────────────────────────────────────────
      "-f",            "hls",
      "-hls_time",     String(config.HLS_SEGMENT_SECONDS),
      "-hls_list_size","0",           // keep ALL segments (full session / multi-clip)
      "-hls_segment_type", "mpegts",
      "-start_number", String(startNumber),
      "-hls_flags",    hlsFlags,
      "-hls_segment_filename", join(outDir, "seg%05d.ts"),

      // Output file for this quality's playlist
      join(outDir, "index.m3u8"),
    );
  }

  const cmdString = `${config.FFMPEG_PATH} ${args.join(" ")}`;
  return { args, cmdString };
}
