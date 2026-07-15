/**
 * In-memory concurrent viewer presence for creator studio.
 * Viewers send heartbeats while on /watch; stale sessions drop after STALE_MS.
 * Process-local (fine for single-instance dev; use Redis later for multi-node).
 */

const STALE_MS = 25_000;

type ViewerEntry = {
  lastSeen: number;
  /** True after this viewer has been counted toward totalViews */
  counted: boolean;
};

/** streamId → (viewerUserId → entry) */
const presence = new Map<string, Map<string, ViewerEntry>>();

function pruneStream(streamId: string, now = Date.now()): Map<string, ViewerEntry> {
  let map = presence.get(streamId);
  if (!map) {
    map = new Map();
    presence.set(streamId, map);
    return map;
  }
  for (const [uid, entry] of map) {
    if (now - entry.lastSeen > STALE_MS) {
      map.delete(uid);
    }
  }
  if (map.size === 0) {
    presence.delete(streamId);
  }
  return map;
}

export function heartbeat(
  streamId: string,
  viewerUserId: string
): { currentViewers: number; isNewSession: boolean } {
  const now = Date.now();
  const map = pruneStream(streamId, now);
  const existing = map.get(viewerUserId);
  const isNewSession = !existing;

  map.set(viewerUserId, {
    lastSeen: now,
    counted: existing?.counted ?? false,
  });

  return { currentViewers: map.size, isNewSession };
}

/** Mark that this viewer's session has been counted in totalViews. */
export function markViewCounted(streamId: string, viewerUserId: string): void {
  const map = presence.get(streamId);
  const entry = map?.get(viewerUserId);
  if (entry) {
    entry.counted = true;
  }
}

export function hasViewCounted(streamId: string, viewerUserId: string): boolean {
  return presence.get(streamId)?.get(viewerUserId)?.counted ?? false;
}

export function leave(streamId: string, viewerUserId: string): number {
  const map = presence.get(streamId);
  if (!map) return 0;
  map.delete(viewerUserId);
  if (map.size === 0) presence.delete(streamId);
  return map.size;
}

export function getCurrentViewers(streamId: string): number {
  return pruneStream(streamId).size;
}

export function getCurrentViewersMany(
  streamIds: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of streamIds) {
    out[id] = getCurrentViewers(id);
  }
  return out;
}
