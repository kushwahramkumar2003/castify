"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearChatAccessToken,
  getChatAccessToken,
  getChatWsUrl,
  type ChatMessage,
  type ChatRole,
  type ChatServerEvent,
} from "@/lib/chat-client";

export interface FloatingReaction {
  id: string;
  emoji: string;
  username: string;
}

interface UseStreamChatOptions {
  streamId: string;
  enabled?: boolean;
}

export function useStreamChat({ streamId, enabled = true }: UseStreamChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<ChatRole>("viewer");
  const [me, setMe] = useState<{ userId: string; username: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [streamEnded, setStreamEnded] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const joinedRef = useRef(false);
  const meIdRef = useRef<string | null>(null);
  const authFailed = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const detachSocket = useCallback((socket: WebSocket | null) => {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close(1000, "client_detach");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const disconnect = useCallback(() => {
    sessionRef.current += 1;
    clearReconnectTimer();
    joinedRef.current = false;
    detachSocket(wsRef.current);
    wsRef.current = null;
    setConnected(false);
  }, [clearReconnectTimer, detachSocket]);

  const connect = useCallback(async () => {
    if (!enabled || !streamId || authFailed.current) return;

    const session = ++sessionRef.current;
    clearReconnectTimer();
    detachSocket(wsRef.current);
    wsRef.current = null;
    joinedRef.current = false;

    let accessToken: string;
    try {
      accessToken = await getChatAccessToken();
    } catch {
      if (session !== sessionRef.current) return;
      authFailed.current = true;
      setError("Sign in required for chat");
      setConnected(false);
      return;
    }

    if (session !== sessionRef.current) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(getChatWsUrl(accessToken));
    } catch {
      if (session !== sessionRef.current) return;
      setError("Chat connection error");
      return;
    }

    if (session !== sessionRef.current) {
      detachSocket(ws);
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (session !== sessionRef.current) return;
      reconnectAttempt.current = 0;
      setError(null);
      ws.send(JSON.stringify({ type: "join", streamId }));
    };

    ws.onmessage = (ev) => {
      if (session !== sessionRef.current) return;

      let data: ChatServerEvent;
      try {
        data = JSON.parse(String(ev.data)) as ChatServerEvent;
      } catch {
        return;
      }

      switch (data.type) {
        case "ready":
          joinedRef.current = true;
          setConnected(true);
          setMessages(data.messages);
          setRole(data.me.role);
          setStreamEnded(!!data.streamEnded);
          meIdRef.current = data.me.userId;
          setMe({ userId: data.me.userId, username: data.me.username });
          break;
        case "message":
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev.slice(-199), data.message];
          });
          break;
        case "reaction": {
          const id = `${data.at}-${data.userId}-${crypto.randomUUID()}`;
          setReactions((prev) => [
            ...prev.slice(-24),
            { id, emoji: data.emoji, username: data.username },
          ]);
          window.setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== id));
          }, 2800);
          break;
        }
        case "system":
          setMessages((prev) => {
            const body = data.body;
            // Drop duplicate join spam if server still sends extras
            if (
              body.endsWith(" joined the chat") &&
              prev.some(
                (m) =>
                  m.userId === "system" &&
                  m.body === body &&
                  Date.now() - new Date(m.createdAt).getTime() < 15_000
              )
            ) {
              return prev;
            }
            return [
              ...prev.slice(-199),
              {
                id: `sys-${data.at}-${crypto.randomUUID()}`,
                streamId,
                userId: "system",
                username: "system",
                body,
                role: "viewer" as const,
                createdAt: data.at,
              },
            ];
          });
          break;
        case "error":
          setError(data.message);
          if (data.code === "UNAUTHORIZED") {
            authFailed.current = true;
            clearChatAccessToken();
            setConnected(false);
            sessionRef.current += 1;
            detachSocket(ws);
            wsRef.current = null;
          } else if (data.code === "FORBIDDEN") {
            setConnected(false);
            sessionRef.current += 1;
            detachSocket(ws);
            wsRef.current = null;
          }
          break;
        case "user_banned":
          if (meIdRef.current === data.userId) {
            setError("You were banned from this chat");
            sessionRef.current += 1;
            detachSocket(ws);
            wsRef.current = null;
          }
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (session !== sessionRef.current) return;
      setConnected(false);
      joinedRef.current = false;
      wsRef.current = null;
      if (!enabled || authFailed.current) return;

      const attempt = reconnectAttempt.current + 1;
      reconnectAttempt.current = attempt;
      if (attempt > 6) {
        setError("Chat disconnected — use Retry");
        return;
      }
      const delay = Math.min(800 * 2 ** (attempt - 1), 12_000);
      clearReconnectTimer();
      reconnectTimer.current = setTimeout(() => {
        void connect();
      }, delay);
    };

    ws.onerror = () => {
      if (session !== sessionRef.current || authFailed.current) return;
      setError("Chat connection error");
    };
  }, [clearReconnectTimer, detachSocket, enabled, streamId]);

  useEffect(() => {
    authFailed.current = false;
    reconnectAttempt.current = 0;
    if (!enabled) {
      disconnect();
      return;
    }
    void connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect, enabled, streamId]);

  const sendMessage = useCallback(
    (body: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !joinedRef.current) return;
      if (streamEnded) return;
      ws.send(JSON.stringify({ type: "message", body }));
    },
    [streamEnded]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !joinedRef.current) return;
      if (streamEnded) return;
      ws.send(JSON.stringify({ type: "reaction", emoji }));
    },
    [streamEnded]
  );

  const reconnect = useCallback(() => {
    authFailed.current = false;
    reconnectAttempt.current = 0;
    clearChatAccessToken();
    void connect();
  }, [connect]);

  return {
    messages,
    connected,
    role,
    me,
    error,
    streamEnded,
    reactions,
    sendMessage,
    sendReaction,
    reconnect,
  };
}
