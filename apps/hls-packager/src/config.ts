import { z } from "zod";

const env = z.object({
  PORT: z.coerce.number().default(3004),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  INSTANCE_ID: z
    .string()
    .default(() => `hp-${Math.random().toString(36).slice(2, 8)}`),

  KAFKA_BROKERS: z.string().default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().default("hls-packager"),
  KAFKA_GROUP_ID: z.string().default("hls-packager-group"),
  KAFKA_TOPIC_VIDEO_SEGMENT_READY: z.string().default("video.segment.ready"),

  STORAGE_ENDPOINT: z.string().default("localhost"),
  STORAGE_PORT: z.coerce.number().default(9100),
  STORAGE_USE_SSL: z
    .preprocess((v) => v === "true" || v === "1", z.boolean())
    .default(false),
  STORAGE_ACCESS_KEY: z.string().default("castify"),
  STORAGE_SECRET_KEY: z.string().default("castify123"),
  STORAGE_BUCKET: z.string().default("hls-segments"),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_FORCE_PATH_STYLE: z
    .preprocess((v) => v === "true" || v === "1", z.boolean())
    .default(false),

  // Raise when encoding many rungs (2k+1080p+…) or multiple streams — each
  // segment is ~2s, so 5 qualities ≈ 2.5 uploads/s per live stream.
  MAX_CONCURRENT_UPLOADS: z.coerce.number().default(24),
});

const parsed = env.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "❌  Invalid environment variables — hls-packager cannot start"
  );
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
