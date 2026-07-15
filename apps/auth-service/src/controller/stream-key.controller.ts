import {
  asyncHandler,
  castifyResponse,
  castifyError,
  zodErrors,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { prisma } from "@castify/db";
import type { Request, Response } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { finalizeStream, isStreamEnded, markStreamOffline } from "../utils/stream.utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateKey(): string {
  return randomBytes(32).toString("hex");
}

function generateStreamId(): string {
  return `stream-${randomBytes(16).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createStreamKeyPayload = z.object({
  label: z.string().min(1).max(50).optional(),
});

const revokeStreamKeyPayload = z.object({
  keyId: z.string().uuid().optional(),
  label: z.string().min(1).max(50).optional(),
});

const validateStreamKeyPayload = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid stream key format"),
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/stream-keys
// ---------------------------------------------------------------------------
// Returns all non-revoked stream keys for the authenticated user.
// If none exist, bootstraps a default key + stream row.
// ---------------------------------------------------------------------------
export const getStreamKeys = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  let keys = await prisma.streamKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true, streamId: true, label: true, createdAt: true },
  });

  // If no keys exist at all, bootstrap the first one
  if (keys.length === 0) {
    const streamId = generateStreamId();

    await prisma.stream.create({
      data: { id: streamId, userId, isLive: false },
    });

    const newKey = await prisma.streamKey.create({
      data: { key: generateKey(), userId, streamId, label: "Default" },
      select: { id: true, key: true, streamId: true, label: true, createdAt: true },
    });

    keys = [newKey];
  }

  return castifyResponse(res, keys, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/stream-keys
// ---------------------------------------------------------------------------
// Creates a new stream key WITHOUT revoking existing ones.
// Existing active streams continue working — the user can switch OBS to the
// new key at their convenience.
// ---------------------------------------------------------------------------
export const createStreamKey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createStreamKeyPayload.safeParse(req.body);
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const userId = req.userId!;

  // Get the streamId from any existing key, or create a new stream row
  const existing = await prisma.streamKey.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  let streamId: string;
  if (existing) {
    streamId = existing.streamId;
    if (await isStreamEnded(streamId)) {
      return castifyError(
        res,
        "Cannot create keys for an ended stream — start a new broadcast instead",
        STATUS_CODE.CONFLICT
      );
    }
  } else {
    streamId = generateStreamId();
    await prisma.stream.create({
      data: { id: streamId, userId, isLive: false },
    });
  }

  const newKey = await prisma.streamKey.create({
    data: {
      key: generateKey(),
      userId,
      streamId,
      label: parsed.data.label ?? null,
    },
    select: { id: true, key: true, streamId: true, label: true, createdAt: true },
  });

  return castifyResponse(res, newKey, "Stream key created", STATUS_CODE.CREATED);
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/stream-keys/revoke
// ---------------------------------------------------------------------------
// Revokes a specific stream key by either keyId or label.
// Revoked keys are immediately rejected by nginx on next stream attempt.
// Streams already in progress stay connected (nginx only validates on connect).
// ---------------------------------------------------------------------------
export const revokeStreamKey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = revokeStreamKeyPayload.safeParse(req.body);
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const { keyId, label } = parsed.data;
  if (!keyId && !label) {
    return castifyError(res, "Provide keyId or label", STATUS_CODE.BAD_REQUEST);
  }

  const userId = req.userId!;

  const where = keyId
    ? { id: keyId, userId }
    : { label: label!, userId, revokedAt: null };

  const key = await prisma.streamKey.findFirst({ where });
  if (!key) {
    return castifyError(res, "Stream key not found", STATUS_CODE.NOT_FOUND);
  }

  if (key.revokedAt) {
    return castifyError(res, "Stream key already revoked", STATUS_CODE.CONFLICT);
  }

  // Don't revoke the last active key — user must have at least one valid key
  const activeCount = await prisma.streamKey.count({
    where: { userId, revokedAt: null },
  });
  if (activeCount <= 1) {
    return castifyError(
      res,
      "Cannot revoke the last stream key — create a new one first",
      STATUS_CODE.CONFLICT
    );
  }

  await prisma.streamKey.update({
    where: { id: key.id },
    data: { revokedAt: new Date() },
  });

  return castifyResponse(res, null, "Stream key revoked");
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/stream-keys/regenerate
// ---------------------------------------------------------------------------
// Full rotation: creates a new key AND revokes all existing ones.
// Use when a key is leaked — this immediately invalidates everything except
// the new key. Active streams disconnect on next reconnection.
// ---------------------------------------------------------------------------
export const regenerateStreamKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  const existing = await prisma.streamKey.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  let streamId: string;
  if (existing) {
    streamId = existing.streamId;
    if (await isStreamEnded(streamId)) {
      return castifyError(
        res,
        "Cannot rotate keys for an ended stream — start a new broadcast instead",
        STATUS_CODE.CONFLICT
      );
    }
  } else {
    streamId = generateStreamId();
    await prisma.stream.create({
      data: { id: streamId, userId, isLive: false },
    });
  }

  // Revoke all existing keys
  await prisma.streamKey.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Create fresh key
  const newKey = await prisma.streamKey.create({
    data: {
      key: generateKey(),
      userId,
      streamId,
      label: "Default",
    },
    select: { id: true, key: true, streamId: true, label: true, createdAt: true },
  });

  return castifyResponse(res, newKey, "All stream keys rotated — only this key is valid now");
});

// ---------------------------------------------------------------------------
// POST /api/v1/internal/validate-stream-key
// ---------------------------------------------------------------------------
// Called by rtmp-ingest. Only accepts non-revoked keys.
// ---------------------------------------------------------------------------
export const validateStreamKey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = validateStreamKeyPayload.safeParse(req.body);
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const { key } = parsed.data;

  const keyRecord = await prisma.streamKey.findUnique({
    where: { key },
  });

  if (!keyRecord || keyRecord.revokedAt) {
    return castifyError(res, "Invalid or revoked stream key", STATUS_CODE.UNAUTHORIZED);
  }

  if (await isStreamEnded(keyRecord.streamId)) {
    return castifyError(res, "Stream has ended — key is no longer valid", STATUS_CODE.UNAUTHORIZED);
  }

  return castifyResponse(res, {
    valid: true,
    userId: keyRecord.userId,
    streamId: keyRecord.streamId,
  }, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// POST /api/v1/internal/streams/:streamId/start
// ---------------------------------------------------------------------------
export const startStreamInternal = asyncHandler(async (req: Request, res: Response) => {
  const streamId = req.params["streamId"] as string;

  await prisma.stream.update({
    where: { id: streamId },
    data: { isLive: true, startedAt: new Date(), endedAt: null, lastActivityAt: new Date() },
  });

  return castifyResponse(res, null, "Stream marked as live");
});

// ---------------------------------------------------------------------------
// POST /api/v1/internal/streams/:streamId/offline
// OBS disconnected — mark offline but keep session open (keys stay valid).
// ---------------------------------------------------------------------------
export const streamOfflineInternal = asyncHandler(async (req: Request, res: Response) => {
  const streamId = req.params["streamId"] as string;

  const result = await markStreamOffline(streamId);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
    }
    return castifyResponse(res, null, "Stream already ended");
  }

  return castifyResponse(res, null, "Stream marked offline — keys remain valid");
});

// ---------------------------------------------------------------------------
// POST /api/v1/internal/streams/:streamId/end
// Permanent end — revokes keys and creates VOD (manual or auto-inactivity).
// ---------------------------------------------------------------------------
export const endStreamInternal = asyncHandler(async (req: Request, res: Response) => {
  const streamId = req.params["streamId"] as string;

  const result = await finalizeStream(streamId);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
    }
    return castifyResponse(res, null, "Stream already ended");
  }

  return castifyResponse(res, { vod: result.vod }, "Stream ended — keys revoked and VOD created");
});

// ---------------------------------------------------------------------------
// GET /api/v1/user/streams/:streamId/keys
// ---------------------------------------------------------------------------
export const getStreamKeysForStream = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const streamId = req.params["streamId"] as string;

  const stream = await prisma.stream.findFirst({
    where: { id: streamId, userId },
  });
  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  const keys = await prisma.streamKey.findMany({
    where: { streamId, userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, key: true, streamId: true, label: true, createdAt: true },
  });

  return castifyResponse(res, keys, STATUS_MSG.OK);
});

// ---------------------------------------------------------------------------
// POST /api/v1/user/streams/:streamId/keys/rotate
// ---------------------------------------------------------------------------
// Rotates keys for a single stream. Blocked once the stream has ended.
// ---------------------------------------------------------------------------
export const rotateStreamKeys = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const streamId = req.params["streamId"] as string;

  const stream = await prisma.stream.findFirst({
    where: { id: streamId, userId },
  });
  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  if (stream.endedAt && !stream.isLive) {
    return castifyError(
      res,
      "Cannot rotate keys for an ended stream",
      STATUS_CODE.CONFLICT
    );
  }

  await prisma.streamKey.updateMany({
    where: { streamId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const newKey = await prisma.streamKey.create({
    data: {
      key: generateKey(),
      userId,
      streamId,
      label: "Rotated Key",
    },
    select: { id: true, key: true, streamId: true, label: true, createdAt: true },
  });

  return castifyResponse(res, newKey, "Stream key rotated — previous keys revoked");
});
