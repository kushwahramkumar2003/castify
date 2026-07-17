-- OAuth + optional password + stream invite/access

ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

DO $$ BEGIN
  CREATE TYPE "StreamInviteKind" AS ENUM ('CODE', 'LINK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "oauth_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "rawProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_accounts_provider_providerAccountId_key"
  ON "oauth_accounts"("provider", "providerAccountId");
CREATE INDEX IF NOT EXISTS "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");
CREATE INDEX IF NOT EXISTS "oauth_accounts_email_idx" ON "oauth_accounts"("email");

CREATE TABLE IF NOT EXISTS "stream_invites" (
    "id" UUID NOT NULL,
    "streamId" VARCHAR(50) NOT NULL,
    "createdById" UUID NOT NULL,
    "kind" "StreamInviteKind" NOT NULL DEFAULT 'CODE',
    "codeHash" VARCHAR(64) NOT NULL,
    "codeHint" VARCHAR(8),
    "label" VARCHAR(80),
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stream_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stream_invites_codeHash_key" ON "stream_invites"("codeHash");
CREATE INDEX IF NOT EXISTS "stream_invites_streamId_idx" ON "stream_invites"("streamId");
CREATE INDEX IF NOT EXISTS "stream_invites_createdById_idx" ON "stream_invites"("createdById");

CREATE TABLE IF NOT EXISTS "stream_access" (
    "id" UUID NOT NULL,
    "streamId" VARCHAR(50) NOT NULL,
    "userId" UUID NOT NULL,
    "inviteId" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "stream_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stream_access_streamId_userId_key"
  ON "stream_access"("streamId", "userId");
CREATE INDEX IF NOT EXISTS "stream_access_userId_idx" ON "stream_access"("userId");
CREATE INDEX IF NOT EXISTS "stream_access_streamId_idx" ON "stream_access"("streamId");

DO $$ BEGIN
  ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "stream_invites" ADD CONSTRAINT "stream_invites_streamId_fkey"
    FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "stream_invites" ADD CONSTRAINT "stream_invites_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "stream_access" ADD CONSTRAINT "stream_access_streamId_fkey"
    FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "stream_access" ADD CONSTRAINT "stream_access_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "stream_access" ADD CONSTRAINT "stream_access_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES "stream_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
