import jwt, { type SignOptions } from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
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

function cookieBaseOptions(): CookieOptions {
  const opts: CookieOptions = {
    httpOnly: true,
    // false on local http:// — true only when COOKIE_SECURE=true
    secure: config.COOKIE_SECURE === true,
    // lax works for localhost:3200 → localhost:3000 (same-site, different port)
    sameSite: "lax",
    path: "/",
  };
  // Only set Domain when non-empty (empty string breaks set/clear)
  const domain = config.COOKIE_DOMAIN?.trim();
  if (domain) {
    opts.domain = domain;
  }
  return opts;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie("castify_token", token, {
    ...cookieBaseOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

/**
 * Clear session cookie. Must match path/domain/secure/sameSite used when set,
 * otherwise the browser keeps the cookie and "logout" appears broken.
 */
export function clearAuthCookie(res: Response): void {
  const base = cookieBaseOptions();

  // Primary clear (same attributes as set)
  res.clearCookie("castify_token", base);

  // Force-expire overwrite (some browsers ignore clearCookie alone)
  res.cookie("castify_token", "", {
    ...base,
    maxAge: 0,
    expires: new Date(0),
  });

  // Also clear host-only variant if we ever set Domain (belt & suspenders)
  if (base.domain) {
    const hostOnly = { ...base };
    delete hostOnly.domain;
    res.clearCookie("castify_token", hostOnly);
    res.cookie("castify_token", "", {
      ...hostOnly,
      maxAge: 0,
      expires: new Date(0),
    });
  }
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
