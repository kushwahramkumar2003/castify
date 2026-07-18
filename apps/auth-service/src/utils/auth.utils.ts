import jwt, { type SignOptions } from "jsonwebtoken";
import type { Response } from "express";
import { config } from "../config";

export interface TokenPayload {
  sub: string;
  username: string;
}

export function signToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: config.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    algorithm: "HS256",
  };

  return jwt.sign(payload, config.JWT_SECRET, options);
}

/** Short-lived token for cross-origin chat WS/REST (same JWT secret). */
export function signChatAccessToken(payload: TokenPayload): string {
  return jwt.sign(
    { ...payload, purpose: "chat" },
    config.JWT_SECRET,
    { expiresIn: "2h", algorithm: "HS256" }
  );
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie("castify_token", token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    domain: config.COOKIE_DOMAIN,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie("castify_token", {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    domain: config.COOKIE_DOMAIN,
  });
}

/** Verify and decode a token. Returns null if invalid or expired. */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as TokenPayload;
  } catch {
    return null;
  }
}
