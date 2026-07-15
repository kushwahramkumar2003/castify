import {
  asyncHandler,
  castifyResponse,
  castifyError,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { prisma } from "@castify/db";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// POST /api/v1/user/follow/:username
// ---------------------------------------------------------------------------
export const follow = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params;

  if (req.username === username) {
    return castifyError(res, "Cannot follow yourself", STATUS_CODE.CONFLICT);
  }

  const targetUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!targetUser) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  const existing = await prisma.subscription.findUnique({
    where: {
      subscriberUserId_streamerUserId: {
        subscriberUserId: req.userId!,
        streamerUserId: targetUser.id,
      },
    },
  });

  if (existing) {
    return castifyError(res, "Already following this user", STATUS_CODE.CONFLICT);
  }

  await prisma.subscription.create({
    data: {
      subscriberUserId: req.userId!,
      streamerUserId: targetUser.id,
    },
  });

  return castifyResponse(res, null, "Followed successfully", STATUS_CODE.OK);
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/user/follow/:username
// ---------------------------------------------------------------------------
export const unfollow = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params;

  const targetUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!targetUser) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  await prisma.subscription.deleteMany({
    where: {
      subscriberUserId: req.userId!,
      streamerUserId: targetUser.id,
    },
  });

  return castifyResponse(res, null, "Unfollowed successfully", STATUS_CODE.OK);
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/following
// ---------------------------------------------------------------------------
export const getFollowing = asyncHandler(async (req: Request, res: Response) => {
  const subscriptions = await prisma.subscription.findMany({
    where: { subscriberUserId: req.userId },
    include: {
      streamer: {
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const users = subscriptions.map((s) => s.streamer);

  return castifyResponse(res, users, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/follow/:username/status
// ---------------------------------------------------------------------------
export const followStatus = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params;

  const targetUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!targetUser) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  if (targetUser.id === req.userId) {
    return castifyResponse(res, { isFollowing: false, isSelf: true }, STATUS_MSG.OK);
  }

  const existing = await prisma.subscription.findUnique({
    where: {
      subscriberUserId_streamerUserId: {
        subscriberUserId: req.userId!,
        streamerUserId: targetUser.id,
      },
    },
  });

  return castifyResponse(
    res,
    { isFollowing: !!existing, isSelf: false },
    STATUS_MSG.OK
  );
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/followers
// ---------------------------------------------------------------------------
export const getFollowers = asyncHandler(async (req: Request, res: Response) => {
  const followers = await prisma.subscription.findMany({
    where: { streamerUserId: req.userId },
    include: {
      subscriber: {
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const users = followers.map((f) => f.subscriber);

  return castifyResponse(res, users, STATUS_MSG.OK);
});
