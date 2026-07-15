import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/auth.utils";
import { hasValidInternalSecret } from "./internal.middleware";

export interface JwtPayload {
  sub: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
    }
  }
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // ── Fast-path: trust headers set by the api-gateway ──────────────────────
  // Identity headers are accepted only when accompanied by the shared internal
  // secret. Header stripping at the gateway alone cannot protect direct access
  // to this service.
  const gatewayVerified = req.headers["x-gateway-verified"] === "true";
  const gatewayUserId   = req.headers["x-user-id"] as string | undefined;
  const gatewayUsername = req.headers["x-username"] as string | undefined;

  if (
    gatewayVerified &&
    gatewayUserId &&
    gatewayUsername &&
    hasValidInternalSecret(req)
  ) {
    req.userId   = gatewayUserId;
    req.username = gatewayUsername;
    next();
    return;
  }

  // ── Fallback: direct call (bypassing the gateway) ─────────────────────────
  // Accepts either a Bearer token or the httpOnly castify_token cookie.
  let token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();

  if (!token && req.cookies?.castify_token) {
    token = req.cookies.castify_token as string;
  }

  if (!token) {
    res
      .status(401)
      .json({ success: false, message: "Unauthorized — no token provided" });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res
      .status(401)
      .json({
        success: false,
        message: "Unauthorized — invalid or expired token",
      });
    return;
  }

  req.userId   = decoded.sub;
  req.username = decoded.username;
  next();
};
