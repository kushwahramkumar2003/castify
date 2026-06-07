import type { Request, Response, NextFunction } from "express";
import { config } from "./config.ts";
import { logger } from "./logger.ts";

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

export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const windowMs = config.RATE_LIMIT_WINDOW_MS;
  const maxRequests = config.RATE_LIMIT_MAX_REQUESTS;

  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;

  res.setHeader("X-RateLimit-Limit", maxRequests);
  res.setHeader(
    "X-RateLimit-Remaining",
    Math.max(0, maxRequests - bucket.count)
  );
  res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > maxRequests) {
    logger.warn({ ip: key, count: bucket.count }, "Rate limit exceeded");
    res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    });
    return;
  }

  next();
}
