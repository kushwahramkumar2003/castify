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
export type QualityLabel = "1080p" | "720p" | "480p" | "360p";

// ---------------------------------------------------------------------------
// Kafka event: published by transcoding-service after each segment lands in MinIO
// Consumers: hls-packager, analytics-service
// ---------------------------------------------------------------------------
export interface VideoSegmentReadyEvent {
  streamId: string;
  userId: string;
  streamKey: string;
  quality: QualityLabel;
  segmentIndex: number;  // monotonically increasing per quality track
  segmentKey: string;    // MinIO object key: live/<streamKey>/<quality>/seg00042.ts
  durationMs: number;    // segment duration in milliseconds (≈2000)
  timestamp: string;     // ISO 8601 — when the segment was uploaded
  isFinal: boolean;      // true on the last segment when stream ends
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
