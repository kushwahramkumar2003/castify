import { baseEnvSchema, createConfig, z } from "@castify/config";

const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3004),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default("http://localhost:3200"),
  CHAT_HISTORY_LENGTH: z.coerce.number().int().min(20).max(500).default(100),
  CHAT_MAX_MESSAGE_LENGTH: z.coerce.number().int().min(50).max(2000).default(500),
  CHAT_RATE_MAX: z.coerce.number().int().min(1).max(30).default(5),
  CHAT_RATE_WINDOW_MS: z.coerce.number().int().min(500).default(3000),
});

export const config = createConfig(envSchema, "chat-service");
export type Config = typeof config;
