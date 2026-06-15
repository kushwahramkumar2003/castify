-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "VodStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STREAM_STARTED', 'STREAM_ENDED', 'CLIP_CREATED', 'FOLLOW', 'UNFOLLOW', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "fullName" VARCHAR(100),
    "username" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255),
    "passwordHash" VARCHAR(60) NOT NULL,
    "displayName" VARCHAR(50),
    "avatarUrl" VARCHAR(500),
    "bio" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_keys" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "streamId" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streams" (
    "id" VARCHAR(50) NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(100),
    "categoryId" UUID,
    "thumbnailUrl" VARCHAR(500),
    "language" VARCHAR(5),
    "tags" VARCHAR(30)[],
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSecs" INTEGER,
    "peakViewers" INTEGER,
    "totalViews" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vods" (
    "id" UUID NOT NULL,
    "streamId" VARCHAR(50) NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200),
    "playlistUrl" VARCHAR(500),
    "durationSecs" INTEGER,
    "thumbnailUrl" VARCHAR(500),
    "status" "VodStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clips" (
    "id" UUID NOT NULL,
    "vodId" UUID NOT NULL,
    "streamId" VARCHAR(50) NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "title" VARCHAR(200),
    "startOffsetSecs" INTEGER NOT NULL,
    "endOffsetSecs" INTEGER NOT NULL,
    "clipUrl" VARCHAR(500),
    "status" "ClipStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "streamId" VARCHAR(50),
    "vodId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "streamStarted" BOOLEAN NOT NULL DEFAULT true,
    "streamEnded" BOOLEAN NOT NULL DEFAULT true,
    "clipCreated" BOOLEAN NOT NULL DEFAULT false,
    "followActivity" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "subscriberUserId" UUID NOT NULL,
    "streamerUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_bans" (
    "id" UUID NOT NULL,
    "streamId" VARCHAR(50) NOT NULL,
    "bannedUserId" UUID NOT NULL,
    "bannedById" UUID NOT NULL,
    "reason" VARCHAR(500),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_words" (
    "id" UUID NOT NULL,
    "streamId" VARCHAR(50),
    "word" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_timeouts" (
    "id" UUID NOT NULL,
    "streamId" VARCHAR(50) NOT NULL,
    "userId" UUID NOT NULL,
    "durationSecs" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_timeouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stream_keys_key_key" ON "stream_keys"("key");

-- CreateIndex
CREATE INDEX "stream_keys_userId_idx" ON "stream_keys"("userId");

-- CreateIndex
CREATE INDEX "stream_keys_streamId_idx" ON "stream_keys"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "streams_userId_idx" ON "streams"("userId");

-- CreateIndex
CREATE INDEX "streams_categoryId_idx" ON "streams"("categoryId");

-- CreateIndex
CREATE INDEX "streams_isLive_idx" ON "streams"("isLive");

-- CreateIndex
CREATE INDEX "streams_startedAt_idx" ON "streams"("startedAt");

-- CreateIndex
CREATE INDEX "vods_streamId_idx" ON "vods"("streamId");

-- CreateIndex
CREATE INDEX "vods_userId_idx" ON "vods"("userId");

-- CreateIndex
CREATE INDEX "vods_status_idx" ON "vods"("status");

-- CreateIndex
CREATE INDEX "clips_vodId_idx" ON "clips"("vodId");

-- CreateIndex
CREATE INDEX "clips_streamId_idx" ON "clips"("streamId");

-- CreateIndex
CREATE INDEX "clips_requestedByUserId_idx" ON "clips"("requestedByUserId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "subscriptions_subscriberUserId_idx" ON "subscriptions"("subscriberUserId");

-- CreateIndex
CREATE INDEX "subscriptions_streamerUserId_idx" ON "subscriptions"("streamerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_subscriberUserId_streamerUserId_key" ON "subscriptions"("subscriberUserId", "streamerUserId");

-- CreateIndex
CREATE INDEX "channel_bans_bannedUserId_idx" ON "channel_bans"("bannedUserId");

-- CreateIndex
CREATE INDEX "channel_bans_streamId_idx" ON "channel_bans"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_bans_streamId_bannedUserId_key" ON "channel_bans"("streamId", "bannedUserId");

-- CreateIndex
CREATE INDEX "banned_words_streamId_idx" ON "banned_words"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "banned_words_streamId_word_key" ON "banned_words"("streamId", "word");

-- CreateIndex
CREATE INDEX "chat_timeouts_streamId_userId_idx" ON "chat_timeouts"("streamId", "userId");

-- CreateIndex
CREATE INDEX "chat_timeouts_expiresAt_idx" ON "chat_timeouts"("expiresAt");

-- AddForeignKey
ALTER TABLE "stream_keys" ADD CONSTRAINT "stream_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streams" ADD CONSTRAINT "streams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streams" ADD CONSTRAINT "streams_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vods" ADD CONSTRAINT "vods_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vods" ADD CONSTRAINT "vods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_vodId_fkey" FOREIGN KEY ("vodId") REFERENCES "vods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriberUserId_fkey" FOREIGN KEY ("subscriberUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_streamerUserId_fkey" FOREIGN KEY ("streamerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_bans" ADD CONSTRAINT "channel_bans_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_bans" ADD CONSTRAINT "channel_bans_bannedUserId_fkey" FOREIGN KEY ("bannedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_bans" ADD CONSTRAINT "channel_bans_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_words" ADD CONSTRAINT "banned_words_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_timeouts" ADD CONSTRAINT "chat_timeouts_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_timeouts" ADD CONSTRAINT "chat_timeouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_timeouts" ADD CONSTRAINT "chat_timeouts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
