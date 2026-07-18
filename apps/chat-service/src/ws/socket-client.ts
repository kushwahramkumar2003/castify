import type { WebSocket } from "ws";
import type { AuthUser } from "../auth";
import type { ChatUserRole, ServerEnvelope } from "../protocol";

export class SocketClient {
  readonly user: AuthUser;
  readonly socket: WebSocket;
  readonly connectedAt = Date.now();

  streamId: string | null = null;
  role: ChatUserRole = "viewer";
  streamEnded = false;

  private bannedWords: string[] = [];
  private bannedWordsFetchedAt = 0;

  constructor(socket: WebSocket, user: AuthUser) {
    this.socket = socket;
    this.user = user;
  }

  get userId(): string {
    return this.user.userId;
  }

  get username(): string {
    return this.user.username;
  }

  get isOpen(): boolean {
    return this.socket.readyState === this.socket.OPEN;
  }

  get isJoined(): boolean {
    return this.streamId !== null;
  }

  send(payload: ServerEnvelope): void {
    if (!this.isOpen) return;
    this.socket.send(JSON.stringify(payload));
  }

  error(code: string, message: string): void {
    this.send({ type: "error", code, message });
  }

  close(code: number, reason: string): void {
    try {
      this.socket.close(code, reason);
    } catch {
      /* socket may already be closed */
    }
  }

  join(streamId: string, role: ChatUserRole, streamEnded = false): void {
    this.streamId = streamId;
    this.role = role;
    this.streamEnded = streamEnded;
    this.bannedWords = [];
    this.bannedWordsFetchedAt = 0;
  }

  leave(): void {
    this.streamId = null;
    this.role = "viewer";
    this.streamEnded = false;
    this.bannedWords = [];
    this.bannedWordsFetchedAt = 0;
  }

  cacheBannedWords(words: string[]): void {
    this.bannedWords = words;
    this.bannedWordsFetchedAt = Date.now();
  }

  getCachedBannedWords(maxAgeMs = 30_000): string[] | null {
    if (!this.bannedWords.length) return null;
    if (Date.now() - this.bannedWordsFetchedAt > maxAgeMs) return null;
    return this.bannedWords;
  }
}
