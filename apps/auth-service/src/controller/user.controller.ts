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
import {
  normalizePlan,
  parseStreamQualities,
  planPublicMeta,
} from "../plans/qualityEntitlements";
import {
  isAllowedImageType,
  uploadStreamThumbnail,
} from "../storage/thumbnails";
import { deleteRecordingStorage } from "../storage/hlsCleanup";

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
      plan: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  const plan = normalizePlan(user.plan);
  return castifyResponse(
    res,
    {
      ...user,
      plan,
      entitlements: planPublicMeta(plan),
    },
    STATUS_MSG.OK
  );
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/entitlements — plan quality ladder for stream create UI
// ---------------------------------------------------------------------------
export const getEntitlements = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { plan: true },
  });
  if (!user) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }
  return castifyResponse(
    res,
    planPublicMeta(normalizePlan(user.plan)),
    STATUS_MSG.OK
  );
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

  if (!user.passwordHash) {
    return castifyError(
      res,
      "This account has no password (OAuth only). Set one from a future flow or use social sign-in.",
      STATUS_CODE.BAD_REQUEST
    );
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
// DELETE /api/v1/user/vods/:vodId
// ---------------------------------------------------------------------------
export const deleteMyVod = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const vodId = String(req.params.vodId ?? "").trim();

  if (!vodId) {
    return castifyError(res, "VOD id is required", STATUS_CODE.BAD_REQUEST);
  }

  const vod = await prisma.vod.findFirst({
    where: { id: vodId, userId },
  });

  if (!vod) {
    return castifyError(res, "Recording not found", STATUS_CODE.NOT_FOUND);
  }

  // Resolve ingest keys so we can wipe live/<streamKey>/… even if playlistUrl is odd
  const streamKeys = await prisma.streamKey.findMany({
    where: { streamId: vod.streamId },
    select: { key: true },
  });

  // Delete from MinIO/S3 BEFORE DB row — so a storage failure is still reported
  // and we do not orphan "deleted" library rows without cleaning objects.
  const storage = await deleteRecordingStorage({
    playlistUrl: vod.playlistUrl,
    streamKeys: streamKeys.map((k) => k.key),
    streamId: vod.streamId,
    thumbnailUrl: vod.thumbnailUrl,
  });

  if (storage.errors.length > 0 && storage.removed === 0 && storage.prefixes.length > 0) {
    // Hard fail when we expected storage work but could not reach the bucket
    return castifyError(
      res,
      `Could not delete recording files from storage: ${storage.errors[0]}`,
      STATUS_CODE.BAD_GATEWAY
    );
  }

  // Clips cascade via Prisma relation onDelete
  await prisma.vod.delete({ where: { id: vod.id } });

  return castifyResponse(
    res,
    {
      id: vod.id,
      deleted: true,
      storageRemoved: storage.removed,
      storagePrefixes: storage.prefixes,
      storageErrors: storage.errors,
    },
    storage.removed > 0
      ? `Recording deleted (${storage.removed} objects removed from storage)`
      : "Recording deleted"
  );
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/streams
// ---------------------------------------------------------------------------
export const createStream = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const {
    title,
    tags,
    qualities,
    isPrivate,
    scheduledAt,
    thumbnailBase64,
    thumbnailContentType,
  } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) {
    return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
  }

  const plan = normalizePlan(user.plan);
  const qualityResult = parseStreamQualities(qualities, plan);
  if (!qualityResult.ok) {
    return castifyError(
      res,
      qualityResult.message,
      STATUS_CODE.UNPROCESSABLE,
      qualityResult.errors
    );
  }

  // Generate a unique streamId format consistent with project layout
  const streamId = `stream-${randomUUID()}`;

  let thumbnailUrl: string | null = null;
  if (typeof thumbnailBase64 === "string" && thumbnailBase64.length > 0) {
    try {
      const raw = thumbnailBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
      const buf = Buffer.from(raw, "base64");
      const mime =
        typeof thumbnailContentType === "string" && isAllowedImageType(thumbnailContentType)
          ? thumbnailContentType
          : thumbnailBase64.startsWith("data:image/png")
          ? "image/png"
          : thumbnailBase64.startsWith("data:image/webp")
          ? "image/webp"
          : "image/jpeg";
      thumbnailUrl = await uploadStreamThumbnail({
        streamId,
        buffer: buf,
        contentType: mime,
      });
    } catch (err: unknown) {
      return castifyError(
        res,
        err instanceof Error ? err.message : "Thumbnail upload failed",
        STATUS_CODE.UNPROCESSABLE
      );
    }
  }

  // Create the stream record
  const stream = await prisma.stream.create({
    data: {
      id: streamId,
      userId,
      title: title || "Untitled Broadcast",
      tags: Array.isArray(tags) ? tags : [],
      qualities: qualityResult.qualities,
      isPrivate: !!isPrivate,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      thumbnailUrl,
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
// POST /api/v1/user/streams/:streamId/thumbnail
// Body: { thumbnailBase64, thumbnailContentType? }
// ---------------------------------------------------------------------------
export const uploadStreamThumbnailHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const streamId = req.params["streamId"] as string;
    const { thumbnailBase64, thumbnailContentType } = req.body ?? {};

    const stream = await prisma.stream.findFirst({
      where: { id: streamId, userId },
      select: { id: true },
    });
    if (!stream) {
      return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
    }

    if (typeof thumbnailBase64 !== "string" || !thumbnailBase64.length) {
      return castifyError(res, "thumbnailBase64 is required", STATUS_CODE.BAD_REQUEST);
    }

    try {
      const raw = thumbnailBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
      const buf = Buffer.from(raw, "base64");
      const mime =
        typeof thumbnailContentType === "string" && isAllowedImageType(thumbnailContentType)
          ? thumbnailContentType
          : "image/jpeg";
      const thumbnailUrl = await uploadStreamThumbnail({
        streamId,
        buffer: buf,
        contentType: mime,
      });
      const updated = await prisma.stream.update({
        where: { id: streamId },
        data: { thumbnailUrl },
      });
      return castifyResponse(res, { thumbnailUrl: updated.thumbnailUrl }, "Thumbnail updated");
    } catch (err: unknown) {
      return castifyError(
        res,
        err instanceof Error ? err.message : "Thumbnail upload failed",
        STATUS_CODE.UNPROCESSABLE
      );
    }
  }
);

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
