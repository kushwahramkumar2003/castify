import type { StreamKeyValidation } from "@castify/types";
import { config, logger } from "../config.ts";
import { MOCK_STREAM_KEYS } from "../mocks/streamKeys.ts";

// =============================================================================
// authService — validates stream keys for incoming RTMP connections
// =============================================================================
//
// Validation order:
//   1. In-process cache (avoids hammering auth-service on every OBS reconnect)
//   2. Real auth-service HTTP call  →  POST /api/v1/internal/validate-stream-key
//   3. Mock fallback (dev only, when AUTH_SERVICE_URL is unreachable)
//
// The mock only fires when the HTTP call fails AND NODE_ENV=development.
// In production the mock is never used — a failed HTTP call = rejection.
// =============================================================================

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

// ---------------------------------------------------------------------------
// Call the real auth-service validate endpoint
// ---------------------------------------------------------------------------
async function validateWithAuthService(streamKey: string): Promise<StreamKeyValidation> {
  const url = new URL(
    "/api/v1/internal/validate-stream-key",
    config.AUTH_SERVICE_URL
  );
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": config.INTERNAL_SECRET,
    },
    body: JSON.stringify({ key: streamKey }),
    signal: AbortSignal.timeout(5_000), // 5 s timeout
  });

  if (resp.ok) {
    // Shape returned by the auth-service validateStreamKey handler:
    // { success: true, data: { valid, userId, streamId, username } }
    const body = await resp.json() as {
      success: boolean;
      data: {
        valid: boolean;
        userId: string;
        streamId: string;
        username?: string;
        qualities?: string[];
      };
    };
    if (body.success && body.data?.valid) {
      return {
        valid: true,
        userId: body.data.userId,
        streamId: body.data.streamId,
        username: body.data.username,
        qualities: body.data.qualities as StreamKeyValidation["qualities"],
      };
    }
    return { valid: false, error: "Stream key not recognized by auth-service" };
  }

  if (resp.status === 401) {
    return { valid: false, error: "Invalid stream key" };
  }

  throw new Error(`Auth-service responded with HTTP ${resp.status}`);
}

// ---------------------------------------------------------------------------
// Hardcoded mock (dev only)
// ---------------------------------------------------------------------------
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
    valid:    true,
    userId:   user.userId,
    streamId: user.streamId,
    username: user.username,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const authService = {
  async validateStreamKey(streamKey: string): Promise<StreamKeyValidation> {
    // 1. Cache hit
    const cached = getCached(streamKey);
    if (cached) {
      logger.debug("Stream key validation — cache hit");
      return cached;
    }

    // 2. Real auth-service
    try {
      const result = await validateWithAuthService(streamKey);
      logger.info(
        {
          streamKey: `${streamKey.slice(0, 8)}…`,
          valid:     result.valid,
          source:    "auth-service",
        },
        "Stream key validated via auth-service"
      );
      if (result.valid) setCache(streamKey, result);
      return result;
    } catch (err) {
      logger.warn(
        { err, streamKey: `${streamKey.slice(0, 8)}…` },
        "Auth-service unreachable — falling back to mock (dev only)"
      );

      // 3. Mock fallback — dev only
      if (config.NODE_ENV !== "development") {
        return { valid: false, error: "Auth-service unavailable" };
      }

      const mockResult = validateWithMock(streamKey);
      if (mockResult.valid) setCache(streamKey, mockResult);
      return mockResult;
    }
  },

  evictStreamKey(streamKey: string): void {
    validationCache.delete(streamKey);
  },
};
