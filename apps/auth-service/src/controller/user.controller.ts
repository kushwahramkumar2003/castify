import {
  asyncHandler,
  castifyResponse,
  castifyError,
  zodErrors,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { prisma } from "@castify/db";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { updateProfilePayload, changePasswordPayload } from "../schema/auth.schema";
import { finalizeStream } from "../utils/stream.utils";
import { getCurrentViewers, getCurrentViewersMany } from "../utils/viewerPresence";

// ---------------------------------------------------------------------------
// GET /api/v1/user/me
// ---------------------------------------------------------------------------
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  return castifyResponse(res, user, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/user/me
// ---------------------------------------------------------------------------
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateProfilePayload.safeParse(req.body);
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const { fullName, bio, avatarUrl } = parsed.data;

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(fullName !== undefined && { fullName }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
    },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return castifyResponse(res, user, "Profile updated");
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/change-password
// ---------------------------------------------------------------------------
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = changePasswordPayload.safeParse(req.body);
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  const isMatch = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!isMatch) {
    return castifyError(res, "Current password is incorrect", STATUS_CODE.UNAUTHORIZED);
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: req.userId },
    data: { passwordHash },
  });

  return castifyResponse(res, null, "Password changed successfully");
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/:username
// ---------------------------------------------------------------------------
export const getPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      fullName: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
      _count: {
        select: {
          subscriptions: true,
          subscribers: true,
        },
      },
    },
  });

  if (!user) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  const response = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdAt: user.createdAt,
    followerCount: user._count.subscribers,
    followingCount: user._count.subscriptions,
  };

  return castifyResponse(res, response, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/streams
// ---------------------------------------------------------------------------
export const getMyStreams = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  const streams = await prisma.stream.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const liveCounts = getCurrentViewersMany(streams.map((s) => s.id));
  const payload = streams.map((s) => ({
    ...s,
    peakViewers: s.peakViewers ?? 0,
    totalViews: s.totalViews ?? 0,
    currentViewers: liveCounts[s.id] ?? 0,
  }));

  return castifyResponse(res, payload, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/vods
// ---------------------------------------------------------------------------
export const getMyVods = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  const vods = await prisma.vod.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return castifyResponse(res, vods, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/streams
// ---------------------------------------------------------------------------
export const createStream = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { title, tags, qualities, isPrivate, scheduledAt } = req.body;

  // Generate a unique streamId format consistent with project layout
  const streamId = `stream-${randomUUID()}`;

  // Create the stream record
  const stream = await prisma.stream.create({
    data: {
      id: streamId,
      userId,
      title: title || "Untitled Broadcast",
      tags: Array.isArray(tags) ? tags : [],
      qualities: Array.isArray(qualities) ? qualities : ["720p", "480p"],
      isPrivate: !!isPrivate,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      isLive: false,
    },
  });

  // Generate the first StreamKey specifically for this stream
  const newKey = await prisma.streamKey.create({
    data: {
      key: randomBytes(32).toString("hex"),
      userId,
      streamId,
      label: title ? `Key for: ${title}` : "Stream Key",
    },
    select: { id: true, key: true, streamId: true, label: true, createdAt: true },
  });

  return castifyResponse(
    res,
    { stream, streamKey: newKey },
    "Stream created and key generated",
    STATUS_CODE.CREATED
  );
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/streams/:streamId
// ---------------------------------------------------------------------------
export const getStreamById = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const streamId = req.params["streamId"] as string;

  const stream = await prisma.stream.findFirst({
    where: { id: streamId, userId },
  });

  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  const [streamKeys, vod] = await Promise.all([
    prisma.streamKey.findMany({
      where: { streamId, userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, key: true, streamId: true, label: true, createdAt: true },
    }),
    prisma.vod.findFirst({
      where: { streamId, userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const currentViewers = stream.endedAt ? 0 : getCurrentViewers(streamId);

  return castifyResponse(
    res,
    {
      stream: {
        ...stream,
        peakViewers: stream.peakViewers ?? 0,
        totalViews: stream.totalViews ?? 0,
        currentViewers,
      },
      streamKeys,
      vod,
      currentViewers,
    },
    STATUS_MSG.OK
  );
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/streams/:streamId/end
// ---------------------------------------------------------------------------
export const endStream = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const streamId = req.params["streamId"] as string;

  const stream = await prisma.stream.findFirst({
    where: { id: streamId, userId },
  });

  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  const result = await finalizeStream(streamId);
  if (!result.ok) {
    if (result.reason === "already_ended") {
      return castifyError(res, "Stream has already ended", STATUS_CODE.CONFLICT);
    }
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  return castifyResponse(
    res,
    { stream: { ...stream, isLive: false, endedAt: new Date(), durationSecs: result.durationSecs }, vod: result.vod },
    "Broadcast ended — ingest keys revoked"
  );
});
