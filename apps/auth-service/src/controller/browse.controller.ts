import {
  asyncHandler,
  castifyResponse,
  castifyError,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { prisma } from "@castify/db";
import type { Request, Response } from "express";
import {
  heartbeat,
  leave,
  getCurrentViewers,
  markViewCounted,
  hasViewCounted,
} from "../utils/viewerPresence";
import { canViewStream } from "../access/streamAccess.service";

const HLS_PUBLIC_BASE =
  process.env.HLS_PUBLIC_BASE_URL ??
  "http://localhost:8080/minio/hls-segments";

function qualityUrlsForKey(streamKey: string, qualities: string[]) {
  const qs = qualities.length ? qualities : ["720p", "480p", "360p"];
  return {
    qualities: qs,
    qualityUrls: Object.fromEntries(
      qs.map((q) => [q, `${HLS_PUBLIC_BASE}/live/${streamKey}/${q}/index.m3u8`])
    ),
  };
}

function buildPlayback(
  streamKey: string | null,
  qualities: string[],
  vodPlaylistUrl: string | null
) {
  if (vodPlaylistUrl) {
    const masterUrl = vodPlaylistUrl.startsWith("http")
      ? vodPlaylistUrl
      : `http://localhost:8080/minio/${vodPlaylistUrl.replace(/^\//, "")}`;
    // Prefer explicit key; else parse from .../live/<key>/master.m3u8
    const keyFromPath =
      streamKey ??
      masterUrl.match(/\/live\/([^/]+)\//)?.[1] ??
      null;
    const ladder = keyFromPath
      ? qualityUrlsForKey(keyFromPath, qualities)
      : {
          qualities: qualities.length ? qualities : ["720p", "480p", "360p"],
          qualityUrls: Object.fromEntries(
            (qualities.length ? qualities : ["720p"]).map((q) => [q, masterUrl])
          ),
        };
    return {
      mode: "vod" as const,
      masterUrl,
      ...ladder,
    };
  }

  if (!streamKey) {
    return {
      mode: "offline" as const,
      masterUrl: null as string | null,
      qualities: qualities,
      qualityUrls: {} as Record<string, string>,
    };
  }

  const ladder = qualityUrlsForKey(streamKey, qualities);
  return {
    mode: "live" as const,
    masterUrl: `${HLS_PUBLIC_BASE}/live/${streamKey}/master.m3u8`,
    ...ladder,
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/browse/streams
// Auth required. Lists public (non-private) streams for discovery.
// Query: q (search title/tags/creator), live=1, following=1
// ---------------------------------------------------------------------------
export const browseStreams = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const liveOnly = req.query.live === "1" || req.query.live === "true";
  const followingOnly =
    req.query.following === "1" || req.query.following === "true";
  const userId = req.userId!;

  let followingIds: string[] = [];
  if (followingOnly) {
    const subs = await prisma.subscription.findMany({
      where: { subscriberUserId: userId },
      select: { streamerUserId: true },
    });
    followingIds = subs.map((s) => s.streamerUserId);
    if (followingIds.length === 0) {
      return castifyResponse(res, [], STATUS_MSG.OK);
    }
  }

  const streams = await prisma.stream.findMany({
    where: {
      isPrivate: false,
      ...(liveOnly ? { isLive: true } : {}),
      ...(followingOnly ? { userId: { in: followingIds } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { tags: { has: q } },
              { user: { username: { contains: q, mode: "insensitive" } } },
              { user: { fullName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ isLive: "desc" }, { lastActivityAt: "desc" }],
    take: 60,
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
    endedAt: s.endedAt,
    createdAt: s.createdAt,
    creator: s.user,
  }));

  return castifyResponse(res, payload, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// GET /api/v1/browse/streams/:streamId
// Auth required. Viewer-safe stream detail + playback URLs (no ingest keys).
// ---------------------------------------------------------------------------
export const browseStreamById = asyncHandler(async (req: Request, res: Response) => {
  const streamId = req.params["streamId"] as string;
  const userId = req.userId!;

  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
          bio: true,
          _count: { select: { subscribers: true } },
        },
      },
    },
  });

  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  const allowed = await canViewStream(userId, stream);
  if (!allowed) {
    return castifyError(
      res,
      "This stream is private. Redeem an invite code in Library → Join.",
      STATUS_CODE.FORBIDDEN
    );
  }

  const [activeKey, vod, following] = await Promise.all([
    prisma.streamKey.findFirst({
      where: { streamId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { key: true },
    }),
    prisma.vod.findFirst({
      where: { streamId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscription.findUnique({
      where: {
        subscriberUserId_streamerUserId: {
          subscriberUserId: userId,
          streamerUserId: stream.userId,
        },
      },
    }),
  ]);

  // totalViews is incremented once per viewer session via heartbeat — not on poll.

  const playback = buildPlayback(
    activeKey?.key ?? null,
    stream.qualities ?? [],
    stream.endedAt && vod?.playlistUrl ? vod.playlistUrl : null
  );

  // Live/ready sessions use active key path even if not currently isLive (READY)
  const readyPlayback =
    !stream.endedAt && activeKey
      ? buildPlayback(activeKey.key, stream.qualities ?? [], null)
      : playback;

  const currentViewers = getCurrentViewers(streamId);

  return castifyResponse(
    res,
    {
      stream: {
        id: stream.id,
        title: stream.title,
        tags: stream.tags,
        isLive: stream.isLive,
        isPrivate: stream.isPrivate,
        qualities: stream.qualities,
        peakViewers: stream.peakViewers ?? 0,
        totalViews: stream.totalViews ?? 0,
        currentViewers,
        thumbnailUrl: stream.thumbnailUrl,
        startedAt: stream.startedAt,
        endedAt: stream.endedAt,
        createdAt: stream.createdAt,
      },
      creator: {
        id: stream.user.id,
        username: stream.user.username,
        fullName: stream.user.fullName,
        avatarUrl: stream.user.avatarUrl,
        bio: stream.user.bio,
        followerCount: stream.user._count.subscribers,
      },
      isFollowing: !!following,
      isOwner: stream.userId === userId,
      playback: stream.endedAt ? playback : readyPlayback,
      vod: vod
        ? {
            id: vod.id,
            title: vod.title,
            playlistUrl: vod.playlistUrl,
            durationSecs: vod.durationSecs,
            status: vod.status,
          }
        : null,
    },
    STATUS_MSG.OK
  );
});

// ---------------------------------------------------------------------------
// POST /api/v1/browse/streams/:streamId/heartbeat
// Auth required. Viewer presence ping while watching.
// ---------------------------------------------------------------------------
export const streamHeartbeat = asyncHandler(async (req: Request, res: Response) => {
  const streamId = req.params["streamId"] as string;
  const userId = req.userId!;

  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: {
      id: true,
      userId: true,
      isPrivate: true,
      endedAt: true,
      peakViewers: true,
      totalViews: true,
    },
  });

  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  const allowed = await canViewStream(userId, stream);
  if (!allowed) {
    return castifyError(
      res,
      "This stream is private. Redeem an invite code first.",
      STATUS_CODE.FORBIDDEN
    );
  }

  // Ended streams: no concurrent presence, still allow response for UI
  if (stream.endedAt) {
    return castifyResponse(
      res,
      {
        currentViewers: 0,
        peakViewers: stream.peakViewers ?? 0,
        totalViews: stream.totalViews ?? 0,
      },
      STATUS_MSG.OK
    );
  }

  const { currentViewers, isNewSession } = heartbeat(streamId, userId);
  const isOwner = stream.userId === userId;

  // Unique session view count (non-owners only, once per presence session)
  let totalViews = stream.totalViews ?? 0;
  if (!isOwner && isNewSession && !hasViewCounted(streamId, userId)) {
    try {
      const updated = await prisma.stream.update({
        where: { id: streamId },
        data: { totalViews: { increment: 1 } },
        select: { totalViews: true },
      });
      totalViews = updated.totalViews ?? totalViews + 1;
      markViewCounted(streamId, userId);
    } catch {
      /* ignore race */
    }
  }

  // Peak concurrent viewers
  let peakViewers = stream.peakViewers ?? 0;
  if (currentViewers > peakViewers) {
    try {
      const updated = await prisma.stream.update({
        where: { id: streamId },
        data: { peakViewers: currentViewers },
        select: { peakViewers: true },
      });
      peakViewers = updated.peakViewers ?? currentViewers;
    } catch {
      peakViewers = currentViewers;
    }
  }

  return castifyResponse(
    res,
    { currentViewers, peakViewers, totalViews },
    STATUS_MSG.OK
  );
});

// ---------------------------------------------------------------------------
// POST /api/v1/browse/streams/:streamId/leave
// Auth required. Viewer closed the watch page.
// ---------------------------------------------------------------------------
export const streamLeave = asyncHandler(async (req: Request, res: Response) => {
  const streamId = req.params["streamId"] as string;
  const userId = req.userId!;

  const currentViewers = leave(streamId, userId);
  return castifyResponse(res, { currentViewers }, STATUS_MSG.OK);
});
