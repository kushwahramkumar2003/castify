import type { Request, Response, NextFunction } from "express";

// =============================================================================
// In-memory per-IP rate limiter for auth routes (login, signup).
// =============================================================================
// Production: replace with Redis-backed sliding window shared across instances.
// =============================================================================

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 30_000).unref();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > maxRequests) {
      res.status(429).json({
        success: false,
        message: "Too many attempts, try again later",
      });
      return;
    }

    next();
  };
}
