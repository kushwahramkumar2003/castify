import { api } from "@/lib/api";

const CHAT_HTTP =
  process.env.NEXT_PUBLIC_CHAT_API_URL ?? "http://localhost:3004/api/v1/chat";
const CHAT_WS =
  process.env.NEXT_PUBLIC_WS_CHAT_URL ?? "ws://localhost:3004/ws";

export type ChatRole = "viewer" | "owner" | "moderator";

export interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  username: string;
  body: string;
  role: ChatRole;
  createdAt: string;
}

export type ChatServerEvent =
  | {
      type: "ready";
      streamId: string;
      messages: ChatMessage[];
      streamEnded: boolean;
      me: { userId: string; username: string; role: ChatRole };
    }
  | { type: "message"; message: ChatMessage }
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

let cachedToken: { token: string; expiresAt: number } | null = null;

export function getChatHttpBase(): string {
  return CHAT_HTTP.replace(/\/$/, "");
}

export function getChatWsUrl(accessToken: string): string {
  const base = CHAT_WS.replace(/\/$/, "");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(accessToken)}`;
}

export async function getChatAccessToken(force = false): Promise<string> {
  const now = Date.now();
  if (
    !force &&
    cachedToken &&
    cachedToken.expiresAt > now + 60_000
  ) {
    return cachedToken.token;
  }

  const res = await api.getChatToken();
  const token = res.data?.token;
  if (!token) {
    throw { status: 401, message: "Could not get chat access token" };
  }

  const expiresIn = res.data.expiresIn ?? 7200;
  cachedToken = {
    token,
    expiresAt: now + expiresIn * 1000,
  };
  return token;
}

export function clearChatAccessToken(): void {
  cachedToken = null;
}

async function chatFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getChatAccessToken();
  const res = await fetch(`${getChatHttpBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string>),
    },
  });
  const json = await res.json().catch(() => null);

  if (res.status === 401) {
    clearChatAccessToken();
    const retryToken = await getChatAccessToken(true);
    const retry = await fetch(`${getChatHttpBase()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${retryToken}`,
        ...(init?.headers as Record<string, string>),
      },
    });
    const retryJson = await retry.json().catch(() => null);
    if (!retry.ok) {
      throw {
        status: retry.status,
        message: retryJson?.message ?? `Chat request failed (${retry.status})`,
      };
    }
    return (retryJson?.data ?? retryJson) as T;
  }

  if (!res.ok) {
    throw {
      status: res.status,
      message: json?.message ?? `Chat request failed (${res.status})`,
    };
  }
  return (json?.data ?? json) as T;
}

export const chatApi = {
  listMessages(streamId: string) {
    return chatFetch<ChatMessage[]>(`/${streamId}/messages`);
  },
  listBans(streamId: string) {
    return chatFetch<
      {
        id: string;
        userId: string;
        username: string;
        fullName: string | null;
        reason: string | null;
        expiresAt: string | null;
        createdAt: string;
      }[]
    >(`/${streamId}/moderation/bans`);
  },
  banUser(
    streamId: string,
    body: { userId: string; reason?: string; expiresInHours?: number | null }
  ) {
    return chatFetch(`/${streamId}/moderation/bans`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  unbanUser(streamId: string, userId: string) {
    return chatFetch(`/${streamId}/moderation/bans/${userId}`, {
      method: "DELETE",
    });
  },
  timeoutUser(
    streamId: string,
    body: { userId: string; durationSecs: number }
  ) {
    return chatFetch(`/${streamId}/moderation/timeouts`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  listWords(streamId: string) {
    return chatFetch<{ id: string; word: string; createdAt: string }[]>(
      `/${streamId}/moderation/words`
    );
  },
  addWord(streamId: string, word: string) {
    return chatFetch(`/${streamId}/moderation/words`, {
      method: "POST",
      body: JSON.stringify({ word }),
    });
  },
  removeWord(streamId: string, wordId: string) {
    return chatFetch(`/${streamId}/moderation/words/${wordId}`, {
      method: "DELETE",
    });
  },
};
