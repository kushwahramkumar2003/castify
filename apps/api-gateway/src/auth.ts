import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.ts";
import { logger } from "./logger.ts";

export interface JwtPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function getTokenFromRequest(req: Request): string | undefined {
  // 1. Try Authorization header
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }

  // 2. Try cookie (castify_token)
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce((acc, pair) => {
      const parts = pair.split("=");
      const key = parts.shift()?.trim();
      const value = parts.join("=").trim();
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    if (cookies["castify_token"]) {
      return cookies["castify_token"];
    }
  }

  return undefined;
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header or castify_token cookie" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err: unknown) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? "Token expired"
        : err instanceof jwt.JsonWebTokenError
          ? "Invalid token"
          : "Authentication failed";
    res.status(401).json({ error: message });
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  try {
    req.user = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;
  } catch {}
  next();
}
