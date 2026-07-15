// ---------------------------------------------------------------------------
// Transcoding worker state machine states
// ---------------------------------------------------------------------------
export type TranscodingState =
  | "IDLE"
  | "STARTING"
  | "TRANSCODING"
  | "STOPPING"
  | "DONE"
  | "ERROR";

// ---------------------------------------------------------------------------
// Quality profile used in FFmpeg output and MinIO path layout
// ---------------------------------------------------------------------------
export type QualityLabel = "2k" | "1080p" | "720p" | "480p" | "360p";

// ---------------------------------------------------------------------------
// Kafka event: published by transcoding-service when a new HLS segment is written
// Consumers: hls-packager (uploads to storage), analytics-service
// ---------------------------------------------------------------------------
export interface VideoSegmentReadyEvent {
  streamId: string;
  userId: string;
  streamKey: string;
  quality: QualityLabel;
  segmentIndex: number;       // monotonically increasing per quality track
  localSegmentPath: string;   // /private/tmp/castify-transcoding/../720p/seg00042.ts
  localPlaylistPath: string;  // /private/tmp/castify-transcoding/../720p/index.m3u8
  segmentKey: string;         // object key: live/<streamKey>/<quality>/seg00042.ts
  durationMs: number;         // segment duration in milliseconds (≈2000)
  timestamp: string;          // ISO 8601
  isFinal: boolean;           // true on the last segment when stream ends
  isMaster: boolean;          // true for the master.m3u8 "first segment" event
  masterPlaylist?: string;    // raw master playlist content (only on startup)
  /**
   * True on the first media segment after an OBS reconnect (same stream key,
   * new FFmpeg session). Packager inserts #EXT-X-DISCONTINUITY so players can
   * stitch multi-clip sessions correctly.
   */
  discontinuity?: boolean;
}

export interface StreamKeyValidation {
  valid: boolean;
  userId?: string;
  streamId?: string;
  username?: string;
  error?: string;
}

export interface StreamStartedEvent {
  streamId: string;
  userId: string;
  streamKey: string;
  startedAt: string;
  clientIp?: string;
  nginxClientId?: string;
}

export interface StreamEndedEvent {
  streamId: string;
  userId: string;
  streamKey: string;
  endedAt: string;
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Snapshot of a single active stream inside a transcoding-service instance.
// Used in the /health response so load-balancers can inspect worker state.
// ---------------------------------------------------------------------------
export interface ActiveStreamSnapshot {
  streamId: string;
  streamKey: string;      // first 8 chars only — redacted in transit
  state: TranscodingState;
  qualities: QualityLabel[];
  startedAt: string;      // ISO 8601
  segmentsUploaded: number;
}
