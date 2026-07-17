import { prisma } from "@castify/db";
import { randomUUID } from "node:crypto";

/** Hours of no ingest activity before an open session is auto-ended. */
export const STREAM_AUTO_END_HOURS = 2;

export async function markStreamOffline(streamId: string) {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
  });

  if (!stream) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (stream.endedAt) {
    return { ok: false as const, reason: "already_ended" as const };
  }

  const now = new Date();
  await prisma.stream.update({
    where: { id: streamId },
    data: { isLive: false, lastActivityAt: now },
  });

  return { ok: true as const };
}

export async function finalizeStream(streamId: string) {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
  });

  if (!stream) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (!stream.isLive && stream.endedAt) {
    return { ok: false as const, reason: "already_ended" as const };
  }

  const endedAt = new Date();
  const durationSecs = stream.startedAt
    ? Math.round((endedAt.getTime() - stream.startedAt.getTime()) / 1_000)
    : 0;

  await prisma.stream.update({
    where: { id: streamId },
    data: { isLive: false, endedAt, durationSecs },
  });

  // Revoke all keys — ended streams cannot accept new ingest
  await prisma.streamKey.updateMany({
    where: { streamId, revokedAt: null },
    data: { revokedAt: endedAt },
  });

  // Resolve ingest key used for this broadcast — live HLS segments live at
  // hls-segments/live/<streamKey>/master.m3u8 (public bucket via nginx proxy).
  const ingestKey = await prisma.streamKey.findFirst({
    where: { streamId },
    orderBy: { createdAt: "desc" },
    select: { key: true },
  });

  const playlistUrl = ingestKey
    ? `hls-segments/live/${ingestKey.key}/master.m3u8`
    : null;

  const existingVod = await prisma.vod.findFirst({
    where: { streamId },
    orderBy: { createdAt: "desc" },
  });

  let vod = existingVod;
  if (!existingVod) {
    const vodId = randomUUID();
    vod = await prisma.vod.create({
      data: {
        id: vodId,
        streamId,
        userId: stream.userId,
        title: stream.title || `Stream Capture - ${endedAt.toLocaleDateString()}`,
        playlistUrl,
        durationSecs,
        thumbnailUrl: stream.thumbnailUrl,
        status: playlistUrl ? "READY" : "PENDING",
      },
    });
  } else if (playlistUrl && existingVod.playlistUrl !== playlistUrl) {
    vod = await prisma.vod.update({
      where: { id: existingVod.id },
      data: { playlistUrl, status: "READY" },
    });
  }

  return { ok: true as const, stream, vod, durationSecs };
}

export async function isStreamEnded(streamId: string): Promise<boolean> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { endedAt: true, isLive: true },
  });
  return !!stream?.endedAt && !stream.isLive;
}

/** Permanently ends open sessions that have been idle (offline) for STREAM_AUTO_END_HOURS. */
export async function autoEndInactiveStreams(): Promise<number> {
  const cutoff = new Date(Date.now() - STREAM_AUTO_END_HOURS * 60 * 60 * 1_000);

  const stale = await prisma.stream.findMany({
    where: {
      endedAt: null,
      isLive: false,
      lastActivityAt: { lt: cutoff },
    },
    select: { id: true },
  });

  let ended = 0;
  for (const { id } of stale) {
    const result = await finalizeStream(id);
    if (result.ok) ended++;
  }

  return ended;
}