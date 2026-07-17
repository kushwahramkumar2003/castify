-- Sync schema drift: stream config fields + stream key metadata
-- These existed in Prisma schema but were never applied to this database.

-- stream_keys: label + revoke support
ALTER TABLE "stream_keys" ADD COLUMN IF NOT EXISTS "label" VARCHAR(50);
ALTER TABLE "stream_keys" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "stream_keys_userId_revokedAt_idx"
  ON "stream_keys"("userId", "revokedAt");

-- streams: quality ladder + privacy + schedule
ALTER TABLE "streams" ADD COLUMN IF NOT EXISTS "qualities" VARCHAR(10)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(10)[];
ALTER TABLE "streams" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "streams" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);

-- Backfill sensible defaults for existing live/ready sessions
UPDATE "streams"
SET "qualities" = ARRAY['720p', '480p']::VARCHAR(10)[]
WHERE "qualities" IS NULL OR cardinality("qualities") = 0;

-- users: OAuth-only accounts (password optional) — idempotent
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
