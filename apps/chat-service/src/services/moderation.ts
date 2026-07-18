import { prisma } from "@castify/db";
import { createHash } from "node:crypto";

export async function isChannelBanned(
  streamId: string,
  userId: string
): Promise<boolean> {
  const ban = await prisma.channelBan.findUnique({
    where: {
      streamId_bannedUserId: { streamId, bannedUserId: userId },
    },
  });
  if (!ban) return false;
  if (ban.expiresAt && ban.expiresAt.getTime() < Date.now()) {
    await prisma.channelBan.delete({ where: { id: ban.id } }).catch(() => {});
    return false;
  }
  return true;
}

export async function isTimedOut(
  streamId: string,
  userId: string
): Promise<{ active: boolean; expiresAt?: Date }> {
  const row = await prisma.chatTimeout.findFirst({
    where: {
      streamId,
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "desc" },
  });
  if (!row) return { active: false };
  return { active: true, expiresAt: row.expiresAt };
}

export async function getBannedWords(streamId: string): Promise<string[]> {
  const rows = await prisma.bannedWord.findMany({
    where: {
      OR: [{ streamId }, { streamId: null }],
    },
    select: { word: true },
  });
  return rows.map((r) => r.word.toLowerCase());
}

export function containsBannedWord(body: string, words: string[]): string | null {
  if (!words.length) return null;
  const lower = body.toLowerCase();
  for (const w of words) {
    if (!w) continue;
    if (lower.includes(w)) return w;
  }
  return null;
}

export async function canAccessStreamChat(
  userId: string,
  streamId: string
): Promise<
  | { ok: true; isOwner: boolean; streamEnded: boolean }
  | { ok: false; reason: string }
> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: {
      id: true,
      userId: true,
      isPrivate: true,
      endedAt: true,
    },
  });
  if (!stream) return { ok: false, reason: "Stream not found" };

  if (stream.userId === userId) {
    return { ok: true, isOwner: true, streamEnded: !!stream.endedAt };
  }

  if (stream.isPrivate) {
    const grant = await prisma.streamAccess.findFirst({
      where: { streamId, userId, revokedAt: null },
      select: { id: true },
    });
    if (!grant) return { ok: false, reason: "Private stream — invite required" };
  }

  if (await isChannelBanned(streamId, userId)) {
    return { ok: false, reason: "You are banned from this chat" };
  }

  return { ok: true, isOwner: false, streamEnded: !!stream.endedAt };
}

export async function assertStreamOwner(
  streamId: string,
  userId: string
): Promise<boolean> {
  const stream = await prisma.stream.findFirst({
    where: { id: streamId, userId },
    select: { id: true },
  });
  return !!stream;
}

export function fingerprintMessage(userId: string, body: string): string {
  return createHash("sha1").update(`${userId}:${body}`).digest("hex").slice(0, 12);
}
