import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@castify/db";
import {
  asyncHandler,
  castifyResponse,
  castifyError,
  zodErrors,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { verifyAccessToken } from "../auth";
import { getSocketManager } from "../app-context";
import { assertStreamOwner, canAccessStreamChat } from "../services/moderation";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
    }
  }
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  let token: string | undefined;
  if (header?.startsWith("Bearer ")) token = header.slice(7);
  else if (req.cookies?.castify_token)
    token = req.cookies.castify_token as string;

  if (!token) {
    castifyError(res, "Unauthorized", STATUS_CODE.UNAUTHORIZED);
    return;
  }
  const user = verifyAccessToken(token);
  if (!user) {
    castifyError(res, "Unauthorized", STATUS_CODE.UNAUTHORIZED);
    return;
  }
  req.userId = user.userId;
  req.username = user.username;
  next();
}

const banSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .optional()
    .nullable(),
});

const timeoutSchema = z.object({
  userId: z.string().uuid(),
  durationSecs: z.number().int().min(30).max(86_400).default(300),
});

const wordSchema = z.object({
  word: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .transform((w) => w.toLowerCase()),
});

export function createRoutes(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "chat-service",
      timestamp: new Date().toISOString(),
    });
  });

  router.get(
    "/:streamId/messages",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      const access = await canAccessStreamChat(req.userId!, streamId);
      if (!access.ok) {
        return castifyError(res, access.reason, STATUS_CODE.FORBIDDEN);
      }
      return castifyResponse(
        res,
        getSocketManager().getHistory(streamId),
        STATUS_MSG.OK
      );
    })
  );

  router.get(
    "/:streamId/moderation/bans",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      if (!(await assertStreamOwner(streamId, req.userId!))) {
        return castifyError(
          res,
          "Only the stream owner can moderate",
          STATUS_CODE.FORBIDDEN
        );
      }
      const bans = await prisma.channelBan.findMany({
        where: { streamId },
        orderBy: { createdAt: "desc" },
        include: {
          bannedUser: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });
      return castifyResponse(
        res,
        bans.map((b) => ({
          id: b.id,
          userId: b.bannedUserId,
          username: b.bannedUser.username,
          fullName: b.bannedUser.fullName,
          reason: b.reason,
          expiresAt: b.expiresAt,
          createdAt: b.createdAt,
        })),
        STATUS_MSG.OK
      );
    })
  );

  router.post(
    "/:streamId/moderation/bans",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      if (!(await assertStreamOwner(streamId, req.userId!))) {
        return castifyError(
          res,
          "Only the stream owner can moderate",
          STATUS_CODE.FORBIDDEN
        );
      }
      const parsed = banSchema.safeParse(req.body);
      if (!parsed.success) {
        return castifyError(
          res,
          STATUS_MSG.VALIDATION_FAILED,
          STATUS_CODE.UNPROCESSABLE,
          zodErrors(parsed.error)
        );
      }
      if (parsed.data.userId === req.userId) {
        return castifyError(
          res,
          "You cannot ban yourself",
          STATUS_CODE.BAD_REQUEST
        );
      }

      const expiresAt =
        parsed.data.expiresInHours != null
          ? new Date(Date.now() + parsed.data.expiresInHours * 3600_000)
          : null;

      const ban = await prisma.channelBan.upsert({
        where: {
          streamId_bannedUserId: {
            streamId,
            bannedUserId: parsed.data.userId,
          },
        },
        create: {
          streamId,
          bannedUserId: parsed.data.userId,
          bannedById: req.userId!,
          reason: parsed.data.reason ?? null,
          expiresAt,
        },
        update: {
          bannedById: req.userId!,
          reason: parsed.data.reason ?? null,
          expiresAt,
        },
        include: {
          bannedUser: { select: { username: true } },
        },
      });

      getSocketManager().disconnectUser(
        streamId,
        parsed.data.userId,
        parsed.data.reason || "Banned from chat"
      );

      return castifyResponse(
        res,
        {
          id: ban.id,
          userId: ban.bannedUserId,
          username: ban.bannedUser.username,
          reason: ban.reason,
          expiresAt: ban.expiresAt,
        },
        "User banned",
        STATUS_CODE.CREATED
      );
    })
  );

  router.delete(
    "/:streamId/moderation/bans/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      const userId = req.params.userId as string;
      if (!(await assertStreamOwner(streamId, req.userId!))) {
        return castifyError(
          res,
          "Only the stream owner can moderate",
          STATUS_CODE.FORBIDDEN
        );
      }

      const existing = await prisma.channelBan.findUnique({
        where: {
          streamId_bannedUserId: { streamId, bannedUserId: userId },
        },
        include: {
          bannedUser: { select: { username: true } },
        },
      });

      await prisma.channelBan.deleteMany({
        where: { streamId, bannedUserId: userId },
      });

      if (existing) {
        getSocketManager().broadcastSystem(
          streamId,
          `@${existing.bannedUser.username} was unbanned from chat`
        );
      }

      return castifyResponse(
        res,
        {
          userId,
          username: existing?.bannedUser.username ?? null,
        },
        "User unbanned"
      );
    })
  );

  router.post(
    "/:streamId/moderation/timeouts",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      if (!(await assertStreamOwner(streamId, req.userId!))) {
        return castifyError(
          res,
          "Only the stream owner can moderate",
          STATUS_CODE.FORBIDDEN
        );
      }
      const parsed = timeoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return castifyError(
          res,
          STATUS_MSG.VALIDATION_FAILED,
          STATUS_CODE.UNPROCESSABLE,
          zodErrors(parsed.error)
        );
      }
      const expiresAt = new Date(Date.now() + parsed.data.durationSecs * 1000);
      const row = await prisma.chatTimeout.create({
        data: {
          streamId,
          userId: parsed.data.userId,
          durationSecs: parsed.data.durationSecs,
          expiresAt,
          createdById: req.userId!,
        },
      });
      return castifyResponse(
        res,
        { id: row.id, userId: row.userId, expiresAt: row.expiresAt },
        "Timeout applied",
        STATUS_CODE.CREATED
      );
    })
  );

  router.get(
    "/:streamId/moderation/words",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      if (!(await assertStreamOwner(streamId, req.userId!))) {
        return castifyError(
          res,
          "Only the stream owner can moderate",
          STATUS_CODE.FORBIDDEN
        );
      }
      const words = await prisma.bannedWord.findMany({
        where: { streamId },
        orderBy: { createdAt: "desc" },
      });
      return castifyResponse(res, words, STATUS_MSG.OK);
    })
  );

  router.post(
    "/:streamId/moderation/words",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      if (!(await assertStreamOwner(streamId, req.userId!))) {
        return castifyError(
          res,
          "Only the stream owner can moderate",
          STATUS_CODE.FORBIDDEN
        );
      }
      const parsed = wordSchema.safeParse(req.body);
      if (!parsed.success) {
        return castifyError(
          res,
          STATUS_MSG.VALIDATION_FAILED,
          STATUS_CODE.UNPROCESSABLE,
          zodErrors(parsed.error)
        );
      }
      const word = await prisma.bannedWord.upsert({
        where: {
          streamId_word: { streamId, word: parsed.data.word },
        },
        create: { streamId, word: parsed.data.word },
        update: {},
      });
      return castifyResponse(res, word, "Word blocked", STATUS_CODE.CREATED);
    })
  );

  router.delete(
    "/:streamId/moderation/words/:wordId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const streamId = req.params.streamId as string;
      const wordId = req.params.wordId as string;
      if (!(await assertStreamOwner(streamId, req.userId!))) {
        return castifyError(
          res,
          "Only the stream owner can moderate",
          STATUS_CODE.FORBIDDEN
        );
      }
      await prisma.bannedWord.deleteMany({
        where: { id: wordId, streamId },
      });
      return castifyResponse(res, null, "Word removed");
    })
  );

  return router;
}
