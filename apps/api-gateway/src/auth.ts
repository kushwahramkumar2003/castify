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

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
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
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  } catch {}
  next();
}
