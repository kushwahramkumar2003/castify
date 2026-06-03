import type { StreamKeyValidation } from "@castify/types";
import { config, logger } from "../config.ts";
import { MOCK_STREAM_KEYS } from "../mocks/streamKeys.ts";

interface CacheEntry {
  result: StreamKeyValidation;
  expiresAt: number;
}
const validationCache = new Map<string, CacheEntry>();

function getCached(streamKey: string): StreamKeyValidation | null {
  const entry = validationCache.get(streamKey);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    validationCache.delete(streamKey);
    return null;
  }
  return entry.result;
}

function setCache(streamKey: string, result: StreamKeyValidation): void {
  validationCache.set(streamKey, {
    result,
    expiresAt: Date.now() + config.STREAM_KEY_CACHE_TTL_SEC * 1_000,
  });
}

function validateWithMock(streamKey: string): StreamKeyValidation {
  const user = MOCK_STREAM_KEYS.get(streamKey);

  if (!user) {
    logger.warn(
      { streamKey: `${streamKey.slice(0, 8)}…` },
      "[MOCK] Unknown stream key — rejecting"
    );
    return { valid: false, error: "Unknown stream key (mock)" };
  }

  logger.info(
    { username: user.username, streamId: user.streamId },
    "[MOCK] Stream key validated — using hardcoded dev data"
  );

  return {
    valid: true,
    userId: user.userId,
    streamId: user.streamId,
    username: user.username,
  };
}

export const authService = {
  async validateStreamKey(streamKey: string): Promise<StreamKeyValidation> {
    const cached = getCached(streamKey);
    if (cached) {
      logger.debug("Stream key validation — cache hit");
      return cached;
    }

    const result = validateWithMock(streamKey);

    if (result.valid) {
      setCache(streamKey, result);
    }

    return result;
  },

  evictStreamKey(streamKey: string): void {
    validationCache.delete(streamKey);
  },
};
