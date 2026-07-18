import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { ChatMessageDto, ChatUserRole, ServerEnvelope } from "../protocol";
import type { SocketClient } from "./socket-client";

export class ChatRoom {
  readonly streamId: string;
  private readonly clients = new Set<SocketClient>();
  private readonly messages: ChatMessageDto[] = [];

  constructor(streamId: string) {
    this.streamId = streamId;
  }

  get size(): number {
    return this.clients.size;
  }

  get isEmpty(): boolean {
    return this.clients.size === 0;
  }

  history(): ChatMessageDto[] {
    return [...this.messages];
  }

  addClient(client: SocketClient): void {
    this.clients.add(client);
  }

  removeClient(client: SocketClient): void {
    this.clients.delete(client);
  }

  appendMessage(
    input: Omit<ChatMessageDto, "id" | "createdAt" | "streamId">
  ): ChatMessageDto {
    const message: ChatMessageDto = {
      id: randomUUID(),
      streamId: this.streamId,
      userId: input.userId,
      username: input.username,
      body: input.body,
      role: input.role,
      createdAt: new Date().toISOString(),
    };

    this.messages.push(message);
    const max = config.CHAT_HISTORY_LENGTH;
    if (this.messages.length > max) {
      this.messages.splice(0, this.messages.length - max);
    }
    return message;
  }

  broadcast(payload: ServerEnvelope, except?: SocketClient): void {
    const raw = JSON.stringify(payload);
    for (const client of this.clients) {
      if (except && client === except) continue;
      if (!client.isOpen) continue;
      client.socket.send(raw);
    }
  }

  clientsForUser(userId: string): SocketClient[] {
    return [...this.clients].filter((c) => c.userId === userId);
  }

  hasClient(client: SocketClient): boolean {
    return this.clients.has(client);
  }
}

export type { ChatUserRole };
