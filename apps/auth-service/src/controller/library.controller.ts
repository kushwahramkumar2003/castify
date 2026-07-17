import {
  asyncHandler,
  castifyResponse,
  castifyError,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { prisma } from "@castify/db";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  canViewStream,
  listAccessibleStreamIds,
} from "../access/streamAccess.service";
import { getCurrentViewers } from "../utils/viewerPresence";

const HLS_PUBLIC_BASE =
  process.env.HLS_PUBLIC_BASE_URL ??
  "http://localhost:8080/minio/hls-segments";

const libraryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

function qualityUrlsForKey(streamKey: string, qualities: string[]) {
  const qs = qualities.length ? qualities : ["720p", "480p", "360p"];
  return {
    qualities: qs,
    qualityUrls: Object.fromEntries(
      qs.map((q) => [q, `${HLS_PUBLIC_BASE}/live/${streamKey}/${q}/index.m3u8`])
    ),
  };
}

function buildVodPlayback(playlistUrl: string | null, streamKey: string | null, qualities: string[]) {
  if (!playlistUrl) {
    return {
      mode: "offline" as const,
      masterUrl: null as string | null,
      qualities,
      qualityUrls: {} as Record<string, string>,
    };
  }
  const masterUrl = playlistUrl.startsWith("http")
    ? playlistUrl
    : `http://localhost:8080/minio/${playlistUrl.replace(/^\//, "")}`;
  const keyFromPath =
    streamKey ?? masterUrl.match(/\/live\/([^/]+)\//)?.[1] ?? null;
  if (keyFromPath) {
    return {
      mode: "vod" as const,
      masterUrl,
      ...qualityUrlsForKey(keyFromPath, qualities),
    };
  }
  return {
    mode: "vod" as const,
    masterUrl,
    qualities: qualities.length ? qualities : ["720p"],
    qualityUrls: { "720p": masterUrl },
  };
}

// GET /library/live — public live + private granted
export const libraryLive = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const parsed = libraryQuerySchema.safeParse(req.query);
  const q = parsed.success ? parsed.data.q : undefined;
  const limit = parsed.success ? parsed.data.limit : 24;

  const grantedIds = await listAccessibleStreamIds(userId);

  const streams = await prisma.stream.findMany({
    where: {
      isLive: true,
      OR: [
        { isPrivate: false },
        { userId },
        ...(grantedIds.length ? [{ id: { in: grantedIds } }] : []),
      ],
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { tags: { has: q } },
                  { user: { username: { contains: q, mode: "insensitive" as const } } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const payload = streams.map((s) => ({
    id: s.id,
    title: s.title,
    tags: s.tags,
    isLive: s.isLive,
    isPrivate: s.isPrivate,
    qualities: s.qualities,
    peakViewers: s.peakViewers ?? 0,
    totalViews: s.totalViews ?? 0,
    currentViewers: getCurrentViewers(s.id),
    thumbnailUrl: s.thumbnailUrl,
    startedAt: s.startedAt,
    createdAt: s.createdAt,
    creator: s.user,
  }));

  return castifyResponse(res, payload, STATUS_MSG.OK);
});

// GET /library/vods
export const libraryVods = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const parsed = libraryQuerySchema.safeParse(req.query);
  const q = parsed.success ? parsed.data.q : undefined;
  const limit = parsed.success ? parsed.data.limit : 24;

  const grantedIds = await listAccessibleStreamIds(userId);

  const vods = await prisma.vod.findMany({
    where: {
      status: "READY",
      playlistUrl: { not: null },
      stream: {
        OR: [
          { isPrivate: false },
          { userId },
          ...(grantedIds.length ? [{ id: { in: grantedIds } }] : []),
        ],
      },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { stream: { title: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      stream: {
        select: {
          id: true,
          title: true,
          isPrivate: true,
          qualities: true,
          thumbnailUrl: true,
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  const payload = vods.map((v) => ({
    id: v.id,
    streamId: v.streamId,
    title: v.title ?? v.stream.title,
    durationSecs: v.durationSecs,
    thumbnailUrl: v.thumbnailUrl ?? v.stream.thumbnailUrl ?? null,
    status: v.status,
    createdAt: v.createdAt,
    stream: {
      id: v.stream.id,
      title: v.stream.title,
      isPrivate: v.stream.isPrivate,
      qualities: v.stream.qualities,
    },
    creator: v.stream.user,
  }));

  return castifyResponse(res, payload, STATUS_MSG.OK);
});

// GET /library/vods/:vodId
export const libraryVodById = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const vodId = req.params["vodId"] as string;

  const vod = await prisma.vod.findUnique({
    where: { id: vodId },
    include: {
      stream: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
              bio: true,
            },
          },
        },
      },
    },
  });

  if (!vod || vod.status !== "READY") {
    return castifyError(res, "Recording not found", STATUS_CODE.NOT_FOUND);
  }

  const allowed = await canViewStream(userId, vod.stream);
  if (!allowed) {
    return castifyError(
      res,
      "This recording is private. Redeem an invite code for the stream first.",
      STATUS_CODE.FORBIDDEN
    );
  }

  const activeKey = await prisma.streamKey.findFirst({
    where: { streamId: vod.streamId },
    orderBy: { createdAt: "desc" },
    select: { key: true },
  });

  const playback = buildVodPlayback(
    vod.playlistUrl,
    activeKey?.key ?? null,
    vod.stream.qualities ?? []
  );

  return castifyResponse(
    res,
    {
      vod: {
        id: vod.id,
        streamId: vod.streamId,
        title: vod.title ?? vod.stream.title,
        durationSecs: vod.durationSecs,
        thumbnailUrl: vod.thumbnailUrl,
        status: vod.status,
        createdAt: vod.createdAt,
      },
      stream: {
        id: vod.stream.id,
        title: vod.stream.title,
        isPrivate: vod.stream.isPrivate,
        qualities: vod.stream.qualities,
      },
      creator: vod.stream.user,
      playback,
    },
    STATUS_MSG.OK
  );
});
