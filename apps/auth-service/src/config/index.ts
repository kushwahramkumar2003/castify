import { baseEnvSchema, createConfig, z } from "@castify/config";

const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  // Shared by trusted internal callers (api-gateway and rtmp-ingest).
  // This must never be exposed to browsers or committed to source control.
  INTERNAL_SECRET: z
    .string()
    .min(32, "INTERNAL_SECRET must be at least 32 characters"),
  CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS must list allowed origins"),

  // Cookie
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  COOKIE_DOMAIN: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SECURE"],
      message: "COOKIE_SECURE must be true in production",
    });
  }
});

export const config = createConfig(envSchema, "auth-service");
export type Config = typeof config;
