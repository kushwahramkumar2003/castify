import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { oauthStateSecret } from "../config";

const SAFE_NEXT = /^\/[a-zA-Z0-9/_-]*$/;

export const oauthStatePayloadSchema = z.object({
  provider: z.enum(["google", "dev"]),
  next: z
    .string()
    .max(200)
    .refine((v) => SAFE_NEXT.test(v), "Invalid next path")
    .default("/library"),
  nonce: z.string().min(8).max(64),
  exp: z.number().int().positive(),
});

export type OAuthStatePayload = z.infer<typeof oauthStatePayloadSchema>;

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", oauthStateSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function createOAuthState(
  input: Omit<OAuthStatePayload, "exp" | "nonce"> & { nonce?: string }
): string {
  const payload: OAuthStatePayload = oauthStatePayloadSchema.parse({
    provider: input.provider,
    next: input.next ?? "/library",
    nonce: input.nonce ?? randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  });
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );
    const parsed = oauthStatePayloadSchema.safeParse(json);
    if (!parsed.success) return null;
    if (parsed.data.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function sanitizeNextPath(raw: unknown): string {
  if (typeof raw !== "string") return "/library";
  const next = raw.trim();
  if (!SAFE_NEXT.test(next)) return "/library";
  return next || "/library";
}
