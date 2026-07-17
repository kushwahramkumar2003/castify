import { prisma } from "@castify/db";
import { randomBytes } from "node:crypto";
import type { OAuthProfile } from "./types";

function slugifyLocal(email: string | null, name: string | null): string {
  let base = (email?.split("@")[0] || name || "viewer")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  if (!base || !/^[a-z]/.test(base)) {
    base = `v${base || "iewer"}`.slice(0, 20);
  }
  return base;
}

async function uniqueUsername(seed: string): Promise<string> {
  let candidate = seed.slice(0, 24);
  if (candidate.length < 3) candidate = `user${candidate}`;
  for (let i = 0; i < 12; i++) {
    const tryName =
      i === 0
        ? candidate
        : `${candidate.slice(0, 20)}${randomBytes(2).toString("hex")}`;
    const exists = await prisma.user.findUnique({
      where: { username: tryName },
      select: { id: true },
    });
    if (!exists) return tryName;
  }
  return `u${randomBytes(8).toString("hex").slice(0, 14)}`;
}

/**
 * Find or create user + OAuthAccount from a verified provider profile.
 */
export async function upsertOAuthUser(profile: OAuthProfile) {
  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (existingAccount) {
    await prisma.oAuthAccount.update({
      where: { id: existingAccount.id },
      data: {
        email: profile.email,
        accessToken: profile.accessToken ?? undefined,
        refreshToken: profile.refreshToken ?? undefined,
        expiresAt: profile.expiresAt ?? undefined,
        rawProfile: profile.raw as object | undefined,
        updatedAt: new Date(),
      },
    });
    if (profile.avatarUrl && !existingAccount.user.avatarUrl) {
      await prisma.user.update({
        where: { id: existingAccount.userId },
        data: { avatarUrl: profile.avatarUrl },
      });
    }
    return existingAccount.user;
  }

  if (profile.email && profile.emailVerified) {
    const byEmail = await prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (byEmail) {
      await prisma.oAuthAccount.create({
        data: {
          userId: byEmail.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
          accessToken: profile.accessToken,
          refreshToken: profile.refreshToken,
          expiresAt: profile.expiresAt,
          rawProfile: profile.raw as object | undefined,
        },
      });
      await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
          avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          fullName: byEmail.fullName ?? profile.fullName,
        },
      });
      return byEmail;
    }
  }

  const username = await uniqueUsername(
    slugifyLocal(profile.email, profile.fullName)
  );

  const user = await prisma.user.create({
    data: {
      username,
      email: profile.email,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      passwordHash: null,
      emailVerifiedAt: profile.emailVerified ? new Date() : null,
      oauthAccounts: {
        create: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
          accessToken: profile.accessToken,
          refreshToken: profile.refreshToken,
          expiresAt: profile.expiresAt,
          rawProfile: profile.raw as object | undefined,
        },
      },
    },
  });

  return user;
}
