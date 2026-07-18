import { z } from "zod";

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    streamId: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal("message"),
    body: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal("reaction"),
    emoji: z.string().min(1).max(16),
  }),
  z.object({ type: z.literal("ping") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ChatUserRole = "viewer" | "owner" | "moderator";

export interface ChatMessageDto {
  id: string;
  streamId: string;
  userId: string;
  username: string;
  body: string;
  role: ChatUserRole;
  createdAt: string;
}

export type ServerEnvelope =
  | {
      type: "ready";
      streamId: string;
      messages: ChatMessageDto[];
      streamEnded: boolean;
      me: { userId: string; username: string; role: ChatUserRole };
    }
  | { type: "message"; message: ChatMessageDto }
  | {
      type: "reaction";
      streamId: string;
      userId: string;
      username: string;
      emoji: string;
      at: string;
    }
  | { type: "system"; body: string; at: string }
  | { type: "user_banned"; userId: string; username?: string }
  | { type: "error"; code: string; message: string }
  | { type: "pong" };
