import { baseEnvSchema, createConfig, z } from "@castify/config";

const envSchema = baseEnvSchema
  .extend({
    PORT: z.coerce.number().default(3000),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    INTERNAL_SECRET: z
      .string()
      .min(32, "INTERNAL_SECRET must be at least 32 characters"),
    CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS must list allowed origins"),

    COOKIE_SECURE: z
      .string()
      .transform((v) => v === "true")
      .default("false"),
    // Empty string → undefined (empty Domain breaks Set-Cookie / logout clear)
    COOKIE_DOMAIN: z
      .string()
      .optional()
      .transform((v) => {
        const t = v?.trim();
        return t ? t : undefined;
      }),

    // OAuth / web redirect
    WEB_ORIGIN: z.string().url().default("http://localhost:3200"),
    OAUTH_STATE_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z
      .string()
      .url()
      .default("http://localhost:3000/api/v1/auth/oauth/google/callback"),
    OAUTH_DEV_BYPASS: z
      .string()
      .transform((v) => v === "true")
      .default("false"),

    // Object storage (thumbnails) — same MinIO as HLS by default
    STORAGE_ENDPOINT: z.string().default("localhost"),
    STORAGE_PORT: z.coerce.number().default(9100),
    STORAGE_USE_SSL: z
      .string()
      .transform((v) => v === "true")
      .default("false"),
    STORAGE_ACCESS_KEY: z.string().default("castify"),
    STORAGE_SECRET_KEY: z.string().default("castify123"),
    STORAGE_REGION: z.string().default("us-east-1"),
    STORAGE_BUCKET: z.string().default("hls-segments"),
    /** Public URL prefix for objects (nginx proxy) */
    THUMBNAIL_PUBLIC_BASE: z
      .string()
      .default("http://localhost:8080/minio/hls-segments"),

    // ── Razorpay (Subscriptions — test mode: rzp_test_…) ─────────────────
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    /** Optional: seed/link PRO plan id (plan_xxx) without calling create API */
    RAZORPAY_PRO_PLAN_ID: z.string().optional(),
    BILLING_CURRENCY: z.string().default("INR"),
    BILLING_PRO_AMOUNT_PAISE: z.coerce.number().int().positive().default(99_900),
    /** Max billing cycles for open-ended-like monthly PRO (120 ≈ 10y) */
    BILLING_SUBSCRIPTION_TOTAL_COUNT: z.coerce.number().int().min(1).max(1200).default(120),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true in production",
      });
    }
    if (env.NODE_ENV === "production" && env.OAUTH_DEV_BYPASS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OAUTH_DEV_BYPASS"],
        message: "OAUTH_DEV_BYPASS must be false in production",
      });
    }
  });

export const config = createConfig(envSchema, "auth-service");
export type Config = typeof config;

export function isGoogleOAuthEnabled(): boolean {
  return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
}

export function oauthStateSecret(): string {
  return config.OAUTH_STATE_SECRET || config.JWT_SECRET;
}
