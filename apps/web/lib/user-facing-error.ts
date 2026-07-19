/**
 * Map API/SDK errors to short, user-safe copy.
 * Never surface env vars, provider names, stack internals, or hostnames.
 */

const INTERNAL_PATTERNS: RegExp[] = [
  /razorpay/i,
  /RAZORPAY_/i,
  /KEY_ID|KEY_SECRET|WEBHOOK_SECRET|PRO_PLAN_ID/i,
  /\.env|auth-service|api-gateway|transcod|minio|kafka|ffmpeg|prisma|redis|postgres/i,
  /localhost|127\.0\.0\.1|:\d{4,5}/i,
  /plan_[A-Za-z0-9]+/i,
  /rzp_(test|live)_/i,
  /statusCode|ECONNREFUSED|stack|at\s+\//i,
  /HMAC|signature|JWT_SECRET|INTERNAL_SECRET/i,
  /Dashboard|Test Mode|Subscriptions product/i,
  /set\s+[A-Z_]{3,}/i,
];

function extractRaw(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message ?? "");
  }
  return "";
}

function looksInternal(msg: string): boolean {
  if (!msg.trim()) return true;
  if (msg.length > 180) return true;
  return INTERNAL_PATTERNS.some((re) => re.test(msg));
}

/** Safe toast/body text for end users. */
export function userFacingError(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const raw = extractRaw(err).trim();
  if (!raw || looksInternal(raw)) return fallback;

  // Allow short, already product-facing messages (plan limits, validation)
  const allowed =
    /plan|upgrade|billing|subscription|password|email|username|invite|banned|quality|key|quota|limit|cancel|payment|checkout|session|sign in|log in|unauthorized|forbidden|not found|try again/i.test(
      raw
    );
  if (!allowed && /[{}[\]\\]/.test(raw)) return fallback;
  if (!allowed && raw.includes("http")) return fallback;

  return raw;
}
