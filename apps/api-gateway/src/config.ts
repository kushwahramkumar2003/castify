import { z } from "zod";

const env = z.object({
  PORT: z.coerce.number().default(3100),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  JWT_SECRET: z
    .string()
    .min(16)
    .default("castify-dev-secret-do-not-use-in-production"),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

  AUTH_SERVICE_URL: z.string().url().default("http://localhost:3000"),
  RTMP_INGEST_URL: z.string().url().default("http://localhost:3001"),
  TRANSCODING_SERVICE_URL: z.string().url().default("http://localhost:3002"),
  HLS_PACKAGER_URL: z.string().url().default("http://localhost:3004"),
  CHAT_SERVICE_URL: z.string().url().default("http://localhost:3004"),
  PRESENCE_SERVICE_URL: z.string().url().default("http://localhost:3005"),
  REACTION_SERVICE_URL: z.string().url().default("http://localhost:3006"),
  NOTIFICATION_SERVICE_URL: z.string().url().default("http://localhost:3007"),
  ANALYTICS_SERVICE_URL: z.string().url().default("http://localhost:3008"),
  MODERATION_SERVICE_URL: z.string().url().default("http://localhost:3009"),
  VOD_SERVICE_URL: z.string().url().default("http://localhost:3010"),
  METADATA_SERVICE_URL: z.string().url().default("http://localhost:3011"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3200,http://localhost:8080"),
});

const parsed = env.safeParse(process.env);
if (!parsed.success) {
  console.error("❌  Invalid environment variables — api-gateway cannot start");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
