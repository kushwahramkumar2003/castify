import {
  asyncHandler,
  castifyResponse,
  castifyError,
  zodErrors,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import type { Request, Response } from "express";
import { loginPayload, signupPayload } from "../schema/auth.schema";
import { prisma } from "@castify/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";
import {
  type RefreshPayload,
  COOKIE_BASE,
  issueTokenPair,
} from "../utils/auth.utils";

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const parsed = signupPayload.safeParse(req.body);
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const { username, fullName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return castifyError(res, STATUS_MSG.EMAIL_CONFLICT, STATUS_CODE.CONFLICT);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { username, fullName, email, passwordHash },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      createdAt: true,
    },
  });

  await issueTokenPair(res, user);

  return castifyResponse(
    res,
    user,
    STATUS_MSG.SIGNUP_SUCCESS,
    STATUS_CODE.CREATED
  );
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginPayload.safeParse(req.body);
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!user) {
    return castifyError(
      res,
      "Invalid email or password",
      STATUS_CODE.UNAUTHORIZED
    );
  }

  const isMatch = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isMatch) {
    return castifyError(
      res,
      "Invalid email or password",
      STATUS_CODE.UNAUTHORIZED
    );
  }

  await issueTokenPair(res, user);

  return castifyResponse(
    res,
    { id: user.id, username: user.username, email: user.email },
    STATUS_MSG.LOGIN_SUCCESS,
    STATUS_CODE.OK
  );
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const rawToken = (req.cookies as Record<string, string>)["refresh_token"];

  if (!rawToken) {
    return castifyError(res, STATUS_MSG.UNAUTHORIZED, STATUS_CODE.UNAUTHORIZED);
  }

  let decoded: RefreshPayload;
  try {
    decoded = jwt.verify(rawToken, config.JWT_SECRET) as RefreshPayload;
  } catch {
    return castifyError(
      res,
      "Invalid or expired refresh token",
      STATUS_CODE.UNAUTHORIZED
    );
  }

  if (decoded.type !== "refresh") {
    return castifyError(res, "Invalid token type", STATUS_CODE.UNAUTHORIZED);
  }

  const dbToken = await prisma.refreshToken.findUnique({
    where: { id: decoded.jti },
    include: { user: { select: { id: true, email: true, username: true } } },
  });

  if (
    !dbToken ||
    dbToken.revokedAt !== null ||
    dbToken.expiresAt < new Date()
  ) {
    return castifyError(
      res,
      "Refresh token is no longer valid",
      STATUS_CODE.UNAUTHORIZED
    );
  }

  await prisma.refreshToken.update({
    where: { id: dbToken.id },
    data: { revokedAt: new Date() },
  });

  await issueTokenPair(res, dbToken.user);

  return castifyResponse(res, null, STATUS_MSG.TOKEN_REFRESHED, STATUS_CODE.OK);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const rawToken = (req.cookies as Record<string, string>)["refresh_token"];

  if (rawToken) {
    try {
      const decoded = jwt.verify(rawToken, config.JWT_SECRET) as RefreshPayload;

      if (decoded.type === "refresh" && decoded.jti) {
        await prisma.refreshToken.updateMany({
          where: { id: decoded.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {}
  }

  res.clearCookie("access_token", COOKIE_BASE);
  res.clearCookie("refresh_token", COOKIE_BASE);

  return castifyResponse(res, null, STATUS_MSG.LOGOUT_SUCCESS, STATUS_CODE.OK);
});
