/**
 * Merge an incoming FFmpeg quality playlist with the one already in MinIO.
 *
 * OBS can stop and start again without permanently ending the Castify session.
 * A naive putObject of FFmpeg's fresh index.m3u8 would drop prior segments.
 * Merging by segment URI keeps every published clip in the same playlist.
 *
 * On reconnect, FFmpeg restarts timestamps — we insert #EXT-X-DISCONTINUITY
 * before the first brand-new segment so players can stitch multi-clip sessions.
 */

export interface MergeOptions {
  /** Permanent end / VOD ready — append EXT-X-ENDLIST. */
  finalize?: boolean;
  /**
   * Force a discontinuity before the first segment URI that is not already
   * in `existing` (OBS reconnect boundary).
   */
  discontinuity?: boolean;
}

interface SegmentEntry {
  extinf: string;
  uri: string;
  index: number;
  discontinuityBefore: boolean;
}

function parsePlaylist(text: string): {
  targetDuration: number;
  version: number;
  segments: SegmentEntry[];
} {
  const lines = text.split(/\r?\n/);
  let targetDuration = 2;
  let version = 3;
  let pendingExtinf: string | null = null;
  let pendingDisc = false;
  const segments: SegmentEntry[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXT-X-VERSION:")) {
      version = parseInt(line.slice("#EXT-X-VERSION:".length), 10) || version;
      continue;
    }
    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      targetDuration =
        parseInt(line.slice("#EXT-X-TARGETDURATION:".length), 10) ||
        targetDuration;
      continue;
    }
    if (line === "#EXT-X-ENDLIST") continue;
    if (line === "#EXT-X-DISCONTINUITY") {
      pendingDisc = true;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      pendingExtinf = line;
      continue;
    }
    if (pendingExtinf && !line.startsWith("#")) {
      const m = line.match(/(\d+)/);
      const index = m ? parseInt(m[1]!, 10) : segments.length;
      segments.push({
        extinf: pendingExtinf,
        uri: line,
        index,
        discontinuityBefore: pendingDisc,
      });
      pendingExtinf = null;
      pendingDisc = false;
    }
  }

  return { targetDuration, version, segments };
}

/**
 * Drop segment entries whose .ts object is not present in storage.
 * Trailing missing segments (common when OBS stops mid-fragment) break
 * hls.js live-edge seeks and leave the creator UI on "Connecting…".
 */
export function filterPlaylistToExistingSegs(
  content: string,
  existingSegNames: Set<string>
): string {
  const parsed = parsePlaylist(content);
  const kept = parsed.segments.filter((s) => {
    const base = s.uri.split("/").pop() ?? s.uri;
    return existingSegNames.has(base) || existingSegNames.has(s.uri);
  });

  if (kept.length === 0) {
    // Prefer empty-but-valid EVENT playlist over listing dead URIs
    return [
      "#EXTM3U",
      `#EXT-X-VERSION:${parsed.version}`,
      `#EXT-X-TARGETDURATION:${parsed.targetDuration}`,
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-PLAYLIST-TYPE:EVENT",
      "",
    ].join("\n");
  }

  const firstIndex = kept[0]!.index;
  const lines: string[] = [
    "#EXTM3U",
    `#EXT-X-VERSION:${parsed.version}`,
    `#EXT-X-TARGETDURATION:${parsed.targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${firstIndex}`,
    "#EXT-X-PLAYLIST-TYPE:EVENT",
  ];
  for (const s of kept) {
    if (s.discontinuityBefore) lines.push("#EXT-X-DISCONTINUITY");
    lines.push(s.extinf);
    lines.push(s.uri);
  }
  return lines.join("\n") + "\n";
}

export function mergeHlsPlaylists(
  existing: string | null | undefined,
  incoming: string,
  opts: MergeOptions = {}
): string {
  const a = existing ? parsePlaylist(existing) : null;
  const b = parsePlaylist(incoming);

  const byUri = new Map<string, SegmentEntry>();
  for (const s of a?.segments ?? []) byUri.set(s.uri, { ...s });
  for (const s of b.segments) {
    const prev = byUri.get(s.uri);
    // Prefer newest EXTINF; keep discontinuity if either side had it
    byUri.set(s.uri, {
      ...s,
      discontinuityBefore: Boolean(prev?.discontinuityBefore || s.discontinuityBefore),
    });
  }

  // Mark discontinuity at reconnect boundary: first URI only present in incoming
  if (opts.discontinuity && a && a.segments.length > 0) {
    const existingUris = new Set(a.segments.map((s) => s.uri));
    const orderedNew = [...byUri.values()]
      .filter((s) => !existingUris.has(s.uri))
      .sort((x, y) => x.index - y.index);
    const firstNew = orderedNew[0];
    if (firstNew) {
      const entry = byUri.get(firstNew.uri);
      if (entry) entry.discontinuityBefore = true;
    }
  }

  const ordered = [...byUri.values()].sort((x, y) => x.index - y.index);
  if (ordered.length === 0) {
    const cleaned = incoming
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "#EXT-X-ENDLIST")
      .join("\n")
      .trimEnd();
    return opts.finalize ? `${cleaned}\n#EXT-X-ENDLIST\n` : `${cleaned}\n`;
  }

  const firstIndex = ordered[0]!.index;
  const targetDuration = Math.max(
    a?.targetDuration ?? 2,
    b.targetDuration,
    ...ordered.map((s) => {
      const d = parseFloat(s.extinf.replace("#EXTINF:", "").split(",")[0] ?? "2");
      return Number.isFinite(d) ? Math.ceil(d) : 2;
    })
  );
  const version = Math.max(a?.version ?? 3, b.version, 3);

  const lines: string[] = [
    "#EXTM3U",
    `#EXT-X-VERSION:${version}`,
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${firstIndex}`,
    // EVENT: playlist grows across OBS reconnects until permanent end
    "#EXT-X-PLAYLIST-TYPE:EVENT",
  ];

  for (const s of ordered) {
    if (s.discontinuityBefore) {
      lines.push("#EXT-X-DISCONTINUITY");
    }
    lines.push(s.extinf);
    lines.push(s.uri);
  }

  if (opts.finalize) {
    lines.push("#EXT-X-ENDLIST");
  }

  return lines.join("\n") + "\n";
}
