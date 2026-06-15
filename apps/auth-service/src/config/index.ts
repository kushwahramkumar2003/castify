import { baseEnvSchema, createConfig, z } from "@castify/config";

const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3000),

  // ── JWT ────────────────────────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),          // access token lifetime

  // ── Refresh token ──────────────────────────────────────────────────────────
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  REFRESH_COOKIE_MAX_AGE_MS: z.coerce
    .number()
    .default(30 * 24 * 60 * 60 * 1000),               // 30 days in ms

  // ── Access-token cookie ────────────────────────────────────────────────────
  COOKIE_MAX_AGE_MS: z.coerce
    .number()
    .default(15 * 60 * 1000),                          // 15 min in ms
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  COOKIE_DOMAIN: z.string().optional(),
});

export const config = createConfig(envSchema, "auth-service");
export type Config = typeof config;
