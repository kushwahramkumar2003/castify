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
import { signToken, setAuthCookie } from "../utils/auth.utils";
import { omit } from "zod/v4-mini";

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

  const token = signToken({ sub: user.id, username: user.username });
  setAuthCookie(res, token);

  return castifyResponse(
    res,
    { user },
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

  const token = signToken({ sub: user.id, username: user.username });
  setAuthCookie(res, token);
  return castifyResponse(
    res,
    {
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      username: user.username,
      bio: user.bio,
      displayName: user.displayName,
      email: user.email,
      id: user.id,
    },
    STATUS_MSG.LOGIN_SUCCESS,
    STATUS_CODE.OK
  );
});
