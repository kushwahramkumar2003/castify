import type { Server as HttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { authenticateRequest } from "../auth";
import { config } from "../config";
import { logger } from "../logger";
import { clientMessageSchema, type ClientMessage } from "../protocol";
import {
  canAccessStreamChat,
  containsBannedWord,
  getBannedWords,
  isTimedOut,
} from "../services/moderation";
import { takeToken } from "../services/rateLimit";
import { ChatRoom } from "./chat-room";
import { SocketClient } from "./socket-client";

const ALLOWED_REACTIONS = new Set([
  "🔥",
  "❤️",
  "😂",
  "👏",
  "😮",
  "🎉",
  "💯",
  "👍",
]);

export class SocketManager {
  private readonly wss: WebSocketServer;
  private readonly rooms = new Map<string, ChatRoom>();
  private readonly clients = new WeakMap<WebSocket, SocketClient>();

  constructor(server: HttpServer, path = "/ws") {
    this.wss = new WebSocketServer({ server, path });
    this.wss.on("connection", (socket, req) => {
      this.onConnection(socket, req);
    });
    this.wss.on("error", (err) => {
      logger.error({ err }, "websocket server error");
    });
  }

  getHistory(streamId: string) {
    return this.rooms.get(streamId)?.history() ?? [];
  }

  roomSize(streamId: string): number {
    return this.rooms.get(streamId)?.size ?? 0;
  }

  disconnectUser(streamId: string, userId: string, reason: string): void {
    const room = this.rooms.get(streamId);
    if (!room) return;

    for (const client of room.clientsForUser(userId)) {
      client.error("BANNED", reason);
      client.send({
        type: "user_banned",
        userId,
        username: client.username,
      });
      room.removeClient(client);
      client.leave();
      client.close(4003, reason);
    }

    this.pruneRoom(streamId);
  }

  broadcastSystem(streamId: string, body: string): void {
    const room = this.rooms.get(streamId);
    if (!room) return;
    room.broadcast({
      type: "system",
      body,
      at: new Date().toISOString(),
    });
  }

  private onConnection(socket: WebSocket, req: IncomingMessage): void {
    const user = authenticateRequest(req);
    if (!user) {
      if (
        socket.readyState === socket.OPEN ||
        socket.readyState === socket.CONNECTING
      ) {
        try {
          socket.send(
            JSON.stringify({
              type: "error",
              code: "UNAUTHORIZED",
              message: "Sign in required for chat",
            })
          );
        } catch {}
        socket.close(4401, "Unauthorized");
      }
      return;
    }

    const client = new SocketClient(socket, user);
    this.clients.set(socket, client);

    socket.on("message", (data) => {
      void this.onMessage(client, data.toString());
    });

    socket.on("close", () => {
      this.onDisconnect(client);
    });

    socket.on("error", () => {
      this.onDisconnect(client);
    });
  }

  private async onMessage(client: SocketClient, raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      client.error("BAD_JSON", "Invalid JSON");
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      client.error(
        "VALIDATION",
        result.error.issues[0]?.message ?? "Invalid message"
      );
      return;
    }

    const msg = result.data;

    try {
      switch (msg.type) {
        case "ping":
          client.send({ type: "pong" });
          break;
        case "join":
          await this.handleJoin(client, msg);
          break;
        case "message":
          await this.handleChatMessage(client, msg);
          break;
        case "reaction":
          this.handleReaction(client, msg);
          break;
        default:
          client.error("UNKNOWN", "Unsupported message type");
      }
    } catch (err) {
      logger.error({ err, userId: client.userId }, "ws message handler failed");
      client.error("INTERNAL", "Something went wrong");
    }
  }

  private async handleJoin(
    client: SocketClient,
    msg: Extract<ClientMessage, { type: "join" }>
  ): Promise<void> {
    if (client.isJoined) {
      this.leaveRoom(client);
    }

    const access = await canAccessStreamChat(client.userId, msg.streamId);
    if (!access.ok) {
      client.error("FORBIDDEN", access.reason);
      client.close(4403, access.reason);
      return;
    }

    const role = access.isOwner ? "owner" : "viewer";
    const room = this.getOrCreateRoom(msg.streamId);

    // Drop prior sockets for this user (reconnect / Strict Mode) without re-announcing.
    const prior = room.clientsForUser(client.userId);
    const isRejoin = prior.length > 0;
    for (const old of prior) {
      room.removeClient(old);
      old.leave();
      try {
        old.socket.close(1000, "replaced");
      } catch {
        /* ignore */
      }
    }

    client.join(msg.streamId, role, access.streamEnded);
    room.addClient(client);

    client.send({
      type: "ready",
      streamId: msg.streamId,
      messages: room.history(),
      streamEnded: access.streamEnded,
      me: {
        userId: client.userId,
        username: client.username,
        role,
      },
    });

    if (!access.streamEnded && !isRejoin) {
      room.broadcast(
        {
          type: "system",
          body: `${client.username} joined the chat`,
          at: new Date().toISOString(),
        },
        client
      );
    }

    logger.debug(
      {
        streamId: msg.streamId,
        userId: client.userId,
        streamEnded: access.streamEnded,
        isRejoin,
      },
      "client joined room"
    );
  }

  private async handleChatMessage(
    client: SocketClient,
    msg: Extract<ClientMessage, { type: "message" }>
  ): Promise<void> {
    if (!client.streamId) {
      client.error("NOT_JOINED", "Join a stream chat first");
      return;
    }

    if (client.streamEnded) {
      client.error("STREAM_ENDED", "Live chat has ended for this stream");
      return;
    }

    const streamId = client.streamId;
    const body = msg.body.trim().slice(0, config.CHAT_MAX_MESSAGE_LENGTH);
    if (!body) {
      client.error("EMPTY", "Message is empty");
      return;
    }

    if (
      !takeToken(
        `msg:${streamId}:${client.userId}`,
        config.CHAT_RATE_MAX,
        config.CHAT_RATE_WINDOW_MS
      )
    ) {
      client.error("RATE_LIMIT", "You are sending messages too quickly");
      return;
    }

    const timeout = await isTimedOut(streamId, client.userId);
    if (timeout.active) {
      client.error("TIMEOUT", "You are timed out from chat");
      return;
    }

    const words = await this.resolveBannedWords(client, streamId);
    if (containsBannedWord(body, words)) {
      client.error("BANNED_WORD", "Message blocked by chat filters");
      return;
    }

    const room = this.rooms.get(streamId);
    if (!room) {
      client.error("NOT_JOINED", "Join a stream chat first");
      return;
    }

    const message = room.appendMessage({
      userId: client.userId,
      username: client.username,
      body,
      role: client.role,
    });

    room.broadcast({ type: "message", message });
  }

  private handleReaction(
    client: SocketClient,
    msg: Extract<ClientMessage, { type: "reaction" }>
  ): void {
    if (!client.streamId) {
      client.error("NOT_JOINED", "Join a stream chat first");
      return;
    }

    if (client.streamEnded) {
      client.error("STREAM_ENDED", "Live chat has ended for this stream");
      return;
    }

    if (!ALLOWED_REACTIONS.has(msg.emoji)) {
      client.error("INVALID_REACTION", "Unsupported reaction");
      return;
    }

    const streamId = client.streamId;
    if (
      !takeToken(
        `react:${streamId}:${client.userId}`,
        config.CHAT_RATE_MAX * 2,
        config.CHAT_RATE_WINDOW_MS
      )
    ) {
      client.error("RATE_LIMIT", "Slow down reactions");
      return;
    }

    const room = this.rooms.get(streamId);
    if (!room) return;

    room.broadcast({
      type: "reaction",
      streamId,
      userId: client.userId,
      username: client.username,
      emoji: msg.emoji,
      at: new Date().toISOString(),
    });
  }

  private async resolveBannedWords(
    client: SocketClient,
    streamId: string
  ): Promise<string[]> {
    const cached = client.getCachedBannedWords();
    if (cached) return cached;
    const words = await getBannedWords(streamId);
    client.cacheBannedWords(words);
    return words;
  }

  private onDisconnect(client: SocketClient): void {
    this.leaveRoom(client);
    this.clients.delete(client.socket);
  }

  private leaveRoom(client: SocketClient): void {
    const streamId = client.streamId;
    if (!streamId) return;

    const room = this.rooms.get(streamId);
    if (room?.hasClient(client)) {
      room.removeClient(client);
    }
    client.leave();
    this.pruneRoom(streamId);
  }

  private getOrCreateRoom(streamId: string): ChatRoom {
    let room = this.rooms.get(streamId);
    if (!room) {
      room = new ChatRoom(streamId);
      this.rooms.set(streamId, room);
    }
    return room;
  }

  private pruneRoom(streamId: string): void {
    const room = this.rooms.get(streamId);
    if (!room) return;
    if (room.isEmpty && room.history().length === 0) {
      this.rooms.delete(streamId);
    }
  }

  close(): void {
    for (const socket of this.wss.clients) {
      try {
        socket.close(1001, "Server shutting down");
      } catch {}
    }
    this.wss.close();
    this.rooms.clear();
  }
}
