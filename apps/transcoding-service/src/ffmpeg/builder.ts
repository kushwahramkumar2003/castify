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
  const { rtmpUrl, tempDir, profiles } = opts;
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
      "-profile:v",   "main",        // H.264 Main Profile — broad device compatibility
      "-level:v",     "4.0",         // Level 4.0 supports up to 1080p 30fps
      "-sc_threshold", "0",           // disable scene-cut detection for stable GOP
      "-g",            String(gopSize),
      "-keyint_min",   String(p.frameRate),
      "-r",            String(p.frameRate),
      "-pix_fmt",      "yuv420p",    // required for Main Profile broad compatibility

      // ── Audio codec ───────────────────────────────────────────────────────
      "-c:a",          "aac",
      "-b:a",          `${p.audioBitrateKbps}k`,
      "-ac",           "2",           // stereo
      "-ar",           "44100",

      // ── HLS muxer ─────────────────────────────────────────────────────────
      "-f",            "hls",
      "-hls_time",     String(config.HLS_SEGMENT_SECONDS),
      "-hls_list_size","0",           // keep ALL segments in playlist (needed for VOD)
      "-hls_segment_type", "mpegts",
      // independent_segments: each .ts can be decoded standalone (required for ABR)
      // temp_file: FFmpeg writes <seg>.ts.tmp → renames → chokidar sees only complete files
      // NOTE: do NOT use delete_segments — we manage cleanup ourselves after MinIO upload
      "-hls_flags",    "independent_segments+temp_file",
      "-hls_segment_filename", join(outDir, "seg%05d.ts"),

      // Output file for this quality's playlist
      join(outDir, "index.m3u8"),
    );
  }

  const cmdString = `${config.FFMPEG_PATH} ${args.join(" ")}`;
  return { args, cmdString };
}
