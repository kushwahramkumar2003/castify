import { baseEnvSchema, createConfig, z } from "@castify/config";

const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Max-age in milliseconds. Default: 7 days
  COOKIE_MAX_AGE_MS: z.coerce.number().default(7 * 24 * 60 * 60 * 1000),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  COOKIE_DOMAIN: z.string().optional(),
});

export const config = createConfig(envSchema, "auth-service");
export type Config = typeof config;
