import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config";

const INTERNAL_SECRET_HEADER = "x-internal-secret";

export function hasValidInternalSecret(req: Request): boolean {
  const provided = req.get(INTERNAL_SECRET_HEADER);
  if (!provided) return false;

  const expectedBuffer = Buffer.from(config.INTERNAL_SECRET);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function requireInternalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!hasValidInternalSecret(req)) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  next();
}
