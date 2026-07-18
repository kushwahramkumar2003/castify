import jwt from "jsonwebtoken";
import { parse as parseCookie } from "cookie";
import type { IncomingMessage } from "node:http";
import { config } from "./config";

export interface AuthUser {
  userId: string;
  username: string;
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as { sub?: string; username?: string };
    if (!payload.sub || !payload.username) return null;
    return { userId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim() || null;
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookie(cookieHeader);
    if (cookies.castify_token) return cookies.castify_token;
  }

  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const q = url.searchParams.get("token");
    if (q) return q;
  } catch {
    /* ignore */
  }

  return null;
}

export function authenticateRequest(req: IncomingMessage): AuthUser | null {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  return verifyAccessToken(token);
}
