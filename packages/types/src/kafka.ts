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
