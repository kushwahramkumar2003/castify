import { z } from "zod";
import { tmpdir } from "node:os";
import { join } from "node:path";

// =============================================================================
// Environment configuration — validated at startup with Zod.
// =============================================================================
const env = z.object({
  // ── Service identity ───────────────────────────────────────────────────────
  PORT:        z.coerce.number().default(3002),
  NODE_ENV:    z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL:   z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // ── Instance identity (for distributed tracing & MinIO paths) ─────────────
  // Each running instance gets a unique ID so segments from different instances
  // don't collide in temp storage.  Set by docker/k8s; auto-generated locally.
  INSTANCE_ID: z.string().default(() => `ts-${Math.random().toString(36).slice(2, 8)}`),

  // ── Kafka ──────────────────────────────────────────────────────────────────
  KAFKA_BROKERS:                   z.string().default("localhost:9092"),
  KAFKA_CLIENT_ID:                 z.string().default("transcoding-service"),
  KAFKA_GROUP_ID:                  z.string().default("transcoding-service-group"),
  KAFKA_TOPIC_STREAM_STARTED:      z.string().default("stream.started"),
  KAFKA_TOPIC_STREAM_ENDED:        z.string().default("stream.ended"),
  KAFKA_TOPIC_VIDEO_SEGMENT_READY: z.string().default("video.segment.ready"),

  // ── Nginx RTMP (where FFmpeg pulls the live stream from) ──────────────────
  // FFmpeg reads raw RTMP directly from nginx — lowest possible latency.
  // Requires ffmpeg with RTMP support (Homebrew ffmpeg includes it).
  NGINX_RTMP_URL: z.string().url().default("rtmp://localhost:1935"),
  NGINX_RTMP_APP: z.string().default("live"),

  // Path to the FFmpeg binary. Defaults to Homebrew-installed ffmpeg on macOS.
  FFMPEG_PATH: z.string().default("/opt/homebrew/bin/ffmpeg"),

  // ── FFmpeg encoding ────────────────────────────────────────────────────────
  // Preset controls encode speed vs compression quality trade-off.
  // Use 'ultrafast' or 'superfast' on M-series Mac to keep CPU load low.
  // Use 'veryfast' or 'fast' for slightly better compression.
  FFMPEG_PRESET: z
    .enum(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"])
    .default("veryfast"),

  // Comma-separated quality tiers to produce (resolved against profiles.ts).
  // Available: "2k,1080p,720p,480p,360p"
  // 2k   = 1440p 60fps  — 8 Mbps  — only if OBS source is 1440p+, very CPU heavy
  // 1080p = 1080p 30fps — 5 Mbps  — good for desktop viewers
  // 720p  = 720p 30fps  — 2.8 Mbps — default high quality
  // 480p  = 480p 30fps  — 1.4 Mbps — mobile / weaker connections
  // 360p  = 360p 30fps  — 0.6 Mbps — very low bandwidth
  //
  // Recommended for M-series Mac (local dev): "1080p,720p,480p,360p"
  // Full 2K ladder (high CPU):               "2k,1080p,720p,480p,360p"
  FFMPEG_QUALITIES: z.string().default("2k,1080p,720p,480p,360p"),

  // HLS segment duration in seconds — must match nginx rtmp.conf hls_fragment
  HLS_SEGMENT_SECONDS: z.coerce.number().default(2),

  // How many HLS segments to keep in the sliding live playlist.
  // After the stream ends we keep all segments for VOD assembly.
  HLS_PLAYLIST_SIZE: z.coerce.number().default(5),

  // ── Concurrency ───────────────────────────────────────────────────────────
  // Max simultaneous FFmpeg processes this instance will run.
  // Scale horizontally by adding more service instances rather than raising this.
  MAX_CONCURRENT_STREAMS: z.coerce.number().default(3),

  // Temp dir for FFmpeg segment output before upload to MinIO.
  // IMPORTANT: use os.tmpdir() — NOT the literal string "/tmp"!
  // On macOS, /tmp is a symlink to /private/tmp. chokidar's kqueue file
  // watcher operates on real (resolved) paths. If we watch "/tmp/..." but
  // FFmpeg writes to "/private/tmp/..." (the real path), the add events are
  // silently dropped and segmentsUploaded stays at 0 forever.
  TEMP_DIR: z.string().default(join(tmpdir(), "castify-transcoding")),

  // ── MinIO (HLS continuity across OBS reconnects) ───────────────────────────
  // Used to discover the next segment number and seed playlists so a stop/start
  // from OBS appends to the same live/<streamKey>/… object tree instead of
  // overwriting seg00000.ts / index.m3u8.
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9100),
  MINIO_USE_SSL: z
    .preprocess((v) => v === "true" || v === "1", z.boolean())
    .default(false),
  MINIO_ACCESS_KEY: z.string().default("castify"),
  MINIO_SECRET_KEY: z.string().default("castify123"),
  MINIO_BUCKET: z.string().default("hls-segments"),
});

const parsed = env.safeParse(process.env);
if (!parsed.success) {
  console.error("❌  Invalid environment variables — transcoding-service cannot start");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
