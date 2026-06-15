import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { Response } from "express";
import { prisma } from "@castify/db";
import { config } from "../config";

export interface AccessPayload {
  sub: string;
  email: string;
  username: string;
}

export interface RefreshPayload extends AccessPayload {
  type: "refresh";
  jti: string;
}

export const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: config.COOKIE_SECURE,
  ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
};

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as unknown as number,
  });
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.REFRESH_TOKEN_EXPIRES_IN as unknown as number,
  });
}

/**
 * Signs an access + refresh token pair, persists the refresh token in the DB,
 * and sets both as httpOnly cookies on the response.
 *
 * @param res  - Express response (cookies are attached here)
 * @param user - Minimal user shape needed for the JWT payload
 */
export async function issueTokenPair(
  res: Response,
  user: { id: string; email: string | null; username: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + config.REFRESH_COOKIE_MAX_AGE_MS);

  const base: AccessPayload = {
    sub: user.id,
    email: user.email ?? "",
    username: user.username,
  };

  const accessToken = signAccessToken(base);
  const refreshToken = signRefreshToken({ ...base, type: "refresh", jti });

  await prisma.refreshToken.create({
    data: { id: jti, userId: user.id, token: refreshToken, expiresAt },
  });

  res.cookie("access_token", accessToken, {
    ...COOKIE_BASE,
    maxAge: config.COOKIE_MAX_AGE_MS,
  });

  res.cookie("refresh_token", refreshToken, {
    ...COOKIE_BASE,
    maxAge: config.REFRESH_COOKIE_MAX_AGE_MS,
  });

  return { accessToken, refreshToken };
}
