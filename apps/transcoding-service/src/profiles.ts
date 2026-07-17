import type { QualityLabel } from "@castify/types";

// =============================================================================
// FFmpeg quality ladder
// =============================================================================
// Each profile defines one output tier.  The transcoding-service reads
// config.FFMPEG_QUALITIES ("720p,480p,360p") and filters this list to only
// the tiers the operator wants to produce.
//
// Bitrate notes:
//   Video bitrate is the _target_ for CBR (Constant Bit Rate).  maxrate and
//   bufsize are set to 110% and 200% respectively — standard CBR two-pass values
//   that prevent spikes while keeping the encoder from throttling too hard.
//
// Preset:
//   libx264 preset controls encode speed vs compression efficiency.
//   "veryfast" is a good balance for live streaming on M-series Macs.
//   "ultrafast" uses ~40% less CPU but produces ~20% larger segments.
//
// Scale filter:
//   scale=W:H:force_original_aspect_ratio=decrease pads to exact resolution
//   without distorting 4:3 or ultra-wide input.
// =============================================================================

export interface QualityProfile {
  label: QualityLabel;
  width: number;
  height: number;
  videoBitrateKbps: number;
  maxVideoBitrateKbps: number; // = videoBitrateKbps * 1.1  (CBR spike guard)
  bufSizeKbps: number;         // = videoBitrateKbps * 2    (buffer size)
  audioBitrateKbps: number;
  frameRate: number;
}

export const QUALITY_PROFILES: Record<QualityLabel, QualityProfile> = {
  "2k": {
    label: "2k",
    width: 2560, height: 1440,
    // 2K (1440p) — 8 Mbps video is the Twitch/YouTube recommended for 1440p60.
    // Only enable if OBS is sending 1440p+ source and CPU can handle it.
    // On M-series Mac: use 'fast' or 'medium' preset to avoid quality degradation.
    videoBitrateKbps: 8_000, maxVideoBitrateKbps: 8_800, bufSizeKbps: 16_000,
    audioBitrateKbps: 192,
    frameRate: 60,
  },
  "1080p": {
    label: "1080p",
    width: 1920, height: 1080,
    videoBitrateKbps: 5_000, maxVideoBitrateKbps: 5_500, bufSizeKbps: 10_000,
    audioBitrateKbps: 192,
    frameRate: 30,
  },
  "720p": {
    label: "720p",
    width: 1280, height: 720,
    videoBitrateKbps: 2_800, maxVideoBitrateKbps: 3_080, bufSizeKbps: 5_600,
    audioBitrateKbps: 128,
    frameRate: 30,
  },
  "480p": {
    label: "480p",
    width: 854, height: 480,
    videoBitrateKbps: 1_400, maxVideoBitrateKbps: 1_540, bufSizeKbps: 2_800,
    audioBitrateKbps: 128,
    frameRate: 30,
  },
  "360p": {
    label: "360p",
    width: 640, height: 360,
    videoBitrateKbps: 600, maxVideoBitrateKbps: 660, bufSizeKbps: 1_200,
    audioBitrateKbps: 96,
    frameRate: 30,
  },
};

// Build the ordered list of active profiles from a comma list or per-stream event.
// e.g. "1080p,720p,480p" → [1080p, 720p, 480p] profiles only
// Unknown labels are dropped. Empty input falls back to 720p,480p.
export function resolveProfiles(qualitiesStr: string): QualityProfile[] {
  const labels = qualitiesStr
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean) as QualityLabel[];
  const resolved = labels
    .filter((l) => QUALITY_PROFILES[l] !== undefined)
    .map((l) => QUALITY_PROFILES[l]!);
  if (resolved.length === 0) {
    return [QUALITY_PROFILES["720p"]!, QUALITY_PROFILES["480p"]!];
  }
  // Deduplicate while preserving order
  const seen = new Set<string>();
  return resolved.filter((p) => {
    if (seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  });
}

// Build the HLS master playlist (ABR) from the active profiles.
// This is written to MinIO once at stream start:
//   live/<streamKey>/master.m3u8
export function buildMasterPlaylist(profiles: QualityProfile[]): string {
  const lines: string[] = ["#EXTM3U", "#EXT-X-VERSION:3", ""];
  for (const p of profiles) {
    const bandwidth = p.videoBitrateKbps * 1000 + p.audioBitrateKbps * 1000;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${p.width}x${p.height},CODECS="avc1.42e01e,mp4a.40.2"`);
    lines.push(`${p.label}/index.m3u8`);
  }
  return lines.join("\n") + "\n";
}
