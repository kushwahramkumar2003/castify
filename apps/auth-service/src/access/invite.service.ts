import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@castify/db";
import type { CreateInviteInput } from "./invite.schema";

export function hashInviteCode(plaintext: string): string {
  return createHash("sha256")
    .update(plaintext.toUpperCase().trim())
    .digest("hex");
}

function generateCodePlaintext(kind: "CODE" | "LINK"): string {
  if (kind === "LINK") {
    return randomBytes(24).toString("base64url").toUpperCase();
  }
  // Human-friendly: CAST-XXXXXX
  const body = randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  return `CAST-${body}`;
}

export async function createStreamInvite(
  streamId: string,
  createdById: string,
  input: CreateInviteInput
) {
  const kind = input.kind ?? "CODE";
  const plaintext = generateCodePlaintext(kind);
  const codeHash = hashInviteCode(plaintext);
  const expiresAt =
    input.expiresInHours != null
      ? new Date(Date.now() + input.expiresInHours * 3600_000)
      : null;

  const invite = await prisma.streamInvite.create({
    data: {
      streamId,
      createdById,
      kind,
      codeHash,
      codeHint: plaintext.slice(0, 8),
      label: input.label ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt,
    },
  });

  return {
    invite: {
      id: invite.id,
      streamId: invite.streamId,
      kind: invite.kind,
      codeHint: invite.codeHint,
      label: invite.label,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      revokedAt: invite.revokedAt,
    },
    /** Shown once — not stored */
    code: plaintext,
  };
}

export async function listStreamInvites(streamId: string, ownerId: string) {
  return prisma.streamInvite.findMany({
    where: { streamId, createdById: ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      streamId: true,
      kind: true,
      codeHint: true,
      label: true,
      maxUses: true,
      useCount: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

export async function revokeStreamInvite(
  inviteId: string,
  streamId: string,
  ownerId: string
) {
  const invite = await prisma.streamInvite.findFirst({
    where: { id: inviteId, streamId, createdById: ownerId },
  });
  if (!invite) return null;
  return prisma.streamInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });
}

export type RedeemResult =
  | { ok: true; streamId: string; alreadyHadAccess: boolean }
  | { ok: false; reason: string };

export async function redeemInviteCode(
  userId: string,
  plaintextCode: string
): Promise<RedeemResult> {
  const codeHash = hashInviteCode(plaintextCode);
  const invite = await prisma.streamInvite.findUnique({
    where: { codeHash },
    include: { stream: { select: { id: true, userId: true, endedAt: true } } },
  });

  if (!invite || invite.revokedAt) {
    return { ok: false, reason: "Invalid or revoked invite code" };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "Invite code has expired" };
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    return { ok: false, reason: "Invite code has reached max uses" };
  }

  const existing = await prisma.streamAccess.findUnique({
    where: {
      streamId_userId: { streamId: invite.streamId, userId },
    },
  });
  if (existing && !existing.revokedAt) {
    return {
      ok: true,
      streamId: invite.streamId,
      alreadyHadAccess: true,
    };
  }

  await prisma.$transaction([
    prisma.streamAccess.upsert({
      where: {
        streamId_userId: { streamId: invite.streamId, userId },
      },
      create: {
        streamId: invite.streamId,
        userId,
        inviteId: invite.id,
      },
      update: {
        revokedAt: null,
        inviteId: invite.id,
        grantedAt: new Date(),
      },
    }),
    prisma.streamInvite.update({
      where: { id: invite.id },
      data: { useCount: { increment: 1 } },
    }),
  ]);

  return {
    ok: true,
    streamId: invite.streamId,
    alreadyHadAccess: false,
  };
}
