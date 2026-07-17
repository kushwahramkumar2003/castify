import { prisma } from "@castify/db";

export type StreamAccessInput = {
  id: string;
  userId: string;
  isPrivate: boolean;
};

/**
 * Owner, public stream, or active StreamAccess grant.
 */
export async function canViewStream(
  userId: string,
  stream: StreamAccessInput
): Promise<boolean> {
  if (stream.userId === userId) return true;
  if (!stream.isPrivate) return true;

  const grant = await prisma.streamAccess.findFirst({
    where: {
      streamId: stream.id,
      userId,
      revokedAt: null,
    },
    select: { id: true },
  });
  return !!grant;
}

export async function listAccessibleStreamIds(userId: string): Promise<string[]> {
  const grants = await prisma.streamAccess.findMany({
    where: { userId, revokedAt: null },
    select: { streamId: true },
  });
  return grants.map((g) => g.streamId);
}
