import ffmpeg from "fluent-ffmpeg";
import { join } from "node:path";
import type { QualityProfile } from "../profiles.ts";
import { config } from "../config.ts";
import { logger } from "../logger.ts";

// =============================================================================
// FFmpeg binary setup
// =============================================================================
// Uses a system-installed FFmpeg (Homebrew on macOS) instead of ffmpeg-static
// because the static binary's native RTMP protocol handler is broken without
// librtmp.  The Homebrew FFmpeg has full RTMP support.
// =============================================================================
ffmpeg.setFfmpegPath(config.FFMPEG_PATH);

// =============================================================================
// buildFfmpegCommand
// =============================================================================
// Builds a multi-quality HLS FFmpeg command from a single RTMP input.
//
// WHY RTMP DIRECT:
// Pulling raw RTMP from nginx avoids the double-HLS relay (nginx HLS → FFmpeg
// reads → FFmpeg writes HLS).  Frames arrive directly from the publisher with
// ~20-50ms network latency + keyframe wait (one GOP = 2s) before the first
// segment is written.
//
// Core idea: ONE FFmpeg process reads the RTMP stream once, then uses a
// filter_complex "split" to fork the video into N parallel encoding chains.
// Audio is re-encoded per output but is CPU-light compared to video.
// =============================================================================

export interface FfmpegCommandOptions {
  rtmpUrl: string;      // rtmp://localhost:1935/live/<stream-key>
  tempDir: string;      // /tmp/castify-transcoding/<instanceId>/<streamKey>
  profiles: QualityProfile[];
}

export function buildFfmpegCommand(opts: FfmpegCommandOptions): ffmpeg.FfmpegCommand {
  const { rtmpUrl, tempDir, profiles } = opts;
  const n = profiles.length;

  // ── Filter complex: split video, scale to each resolution ──────────────────
  // e.g. for 3 qualities:
  //   [0:v]split=3[v0][v1][v2];
  //   [v0]scale=1280:720:... [v0out];
  //   [v1]scale=854:480:... [v1out];
  //   [v2]scale=640:360:... [v2out];
  //
  // force_original_aspect_ratio=decrease: letterbox to target without distortion.
  //
  // CRITICAL: scale dimensions can end up odd (e.g. 853 instead of 854) when
  // the source isn't perfect 16:9.  x264 / yuv420p require width divisible by 2.
  // Adding a second scale pass with `trunc(iw/2)*2` guarantees even output.
  const splitOutputs = profiles.map((_, i) => `[v${i}]`).join("");
  const splitFilter = `[0:v]split=${n}${splitOutputs}`;
  const scaleFilters = profiles.map(
    (p, i) =>
      `[v${i}]scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v${i}out]`
  );
  const complexFilter = [splitFilter, ...scaleFilters].join(";");

  let cmd = ffmpeg(rtmpUrl)
    // ── Input options for RTMP pull ───────────────────────────────────────
    // -rw_timeout 10M — socket I/O timeout in microseconds (10 seconds).
    //                    NEVER use plain -timeout — it implies -rtmp_listen 1
    //                    (server mode) and causes "Address already in use".
    //
    // FFmpeg 8.x handles RTMP live streams without any special flags.
    // The stream is inherently live (nginx-rtmp only sends the current
    // live buffer), so -rtmp_live, -fflags nobuffer, -flags low_delay
    // are unnecessary and can cause parse errors on this FFmpeg version.
    .inputOption("-rw_timeout", "30000000")
    .complexFilter(complexFilter);

  // ── One output per quality profile ─────────────────────────────────────────
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i]!;
    const outDir = join(tempDir, p.label);

    cmd = cmd
      .addOutput(join(outDir, "index.m3u8"))
      // Video mapping — the scaled output from filter_complex
      .addOutputOption(`-map`, `[v${i}out]`)
      // Audio mapping — re-encode shared audio track for each output
      .addOutputOption(`-map`, `0:a?`)  // '?' = don't fail if no audio
      // Video codec
      .addOutputOption(`-c:v`, `libx264`)
      .addOutputOption(`-b:v`, `${p.videoBitrateKbps}k`)
      .addOutputOption(`-maxrate`, `${p.maxVideoBitrateKbps}k`)
      .addOutputOption(`-bufsize`, `${p.bufSizeKbps}k`)
      .addOutputOption(`-preset`, config.FFMPEG_PRESET)
      .addOutputOption(`-profile:v`, `main`)   // H.264 Main Profile (broad compatibility)
      .addOutputOption(`-sc_threshold`, `0`)   // Disable scene-cut detection (stable GOP)
      .addOutputOption(`-g`, `${p.frameRate * 2}`) // GOP = 2× frame rate (2-second keyframe interval)
      .addOutputOption(`-keyint_min`, `${p.frameRate}`)
      .addOutputOption(`-r`, `${p.frameRate}`)
      // Audio codec
      .addOutputOption(`-c:a`, `aac`)
      .addOutputOption(`-b:a`, `${p.audioBitrateKbps}k`)
      .addOutputOption(`-ac`, `2`)      // Stereo
      .addOutputOption(`-ar`, `44100`)  // Sample rate
      // HLS muxer options
      .addOutputOption(`-f`, `hls`)
      .addOutputOption(`-hls_time`, `${config.HLS_SEGMENT_SECONDS}`)
      .addOutputOption(`-hls_list_size`, `0`)  // 0 = keep ALL segments in playlist (for VOD)
      .addOutputOption(`-hls_segment_type`, `mpegts`)
      .addOutputOption(`-hls_flags`, `independent_segments+temp_file+delete_segments`)
      //   independent_segments  — each .ts can be decoded standalone
      //   temp_file             — FFmpeg writes <name>.ts.tmp then renames to <name>.ts
      //                           so chokidar only sees complete files
      //   delete_segments       — FFmpeg deletes old .ts files it no longer references
      //                           (we've already uploaded them to MinIO at that point)
      .addOutputOption(`-hls_segment_filename`, join(outDir, `seg%05d.ts`));
  }

  return cmd;
}
