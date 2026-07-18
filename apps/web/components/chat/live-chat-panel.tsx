"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useStreamChat } from "@/hooks/use-stream-chat";
import {
  RiChat3Line,
  RiSendPlane2Line,
  RiWifiOffLine,
  RiLoader4Line,
  RiChatOffLine,
} from "react-icons/ri";

const REACTIONS = ["🔥", "❤️", "😂", "👏", "😮", "🎉", "💯", "👍"] as const;

interface LiveChatPanelProps {
  streamId: string;
  enabled?: boolean;
  streamEnded?: boolean;
  compact?: boolean;
  /** Fill parent height (studio layout) */
  fill?: boolean;
  className?: string;
  onBanUser?: (userId: string, username: string) => void;
  showModActions?: boolean;
}

export function LiveChatPanel({
  streamId,
  enabled = true,
  streamEnded: streamEndedProp = false,
  compact = false,
  fill = false,
  className = "",
  onBanUser,
  showModActions = false,
}: LiveChatPanelProps) {
  const {
    messages,
    connected,
    role,
    me,
    error,
    streamEnded: streamEndedFromServer,
    reactions,
    sendMessage,
    sendReaction,
    reconnect,
  } = useStreamChat({ streamId, enabled });

  const chatEnded = streamEndedProp || streamEndedFromServer;
  const canCompose = connected && !chatEnded;

  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCompose) return;
    const body = draft.trim();
    if (!body) return;
    sendMessage(body);
    setDraft("");
  };

  const heightClass = fill
    ? "h-full min-h-[360px] max-h-[min(720px,calc(100dvh-12rem))]"
    : compact
    ? "h-[320px]"
    : "h-[min(480px,60vh)]";

  return (
    <div
      className={`supabase-panel flex flex-col min-h-0 relative overflow-hidden ${heightClass} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <RiChat3Line
            className={`size-4 shrink-0 ${
              chatEnded ? "text-muted-foreground" : "text-emerald-400"
            }`}
          />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
            {chatEnded ? "Chat" : "Live chat"}
          </h3>
        </div>
        <Badge
          className={`text-[9px] font-bold ${
            chatEnded
              ? "bg-neutral-800 text-muted-foreground border-border"
              : connected
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : "bg-neutral-800 text-muted-foreground"
          }`}
        >
          {chatEnded ? "Ended" : connected ? "Connected" : "Offline"}
        </Badge>
      </div>

      {chatEnded && (
        <div className="px-3 sm:px-4 py-2.5 border-b border-border/40 bg-[#141414]/80 flex items-start gap-2 shrink-0">
          <RiChatOffLine className="size-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground/90">
              Live chat has ended
            </p>
            <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
              This stream is over. You can still scroll older messages if any
              were sent while it was live.
            </p>
          </div>
        </div>
      )}

      {!chatEnded && (
        <div className="absolute inset-x-0 top-12 h-24 pointer-events-none overflow-hidden z-10">
          {reactions.map((r) => (
            <span
              key={r.id}
              className="absolute animate-bounce text-xl"
              style={{
                left: `${10 + (r.id.charCodeAt(r.id.length - 1) % 70)}%`,
                top: `${10 + (r.id.charCodeAt(2) % 40)}%`,
              }}
              title={r.username}
            >
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 space-y-2 min-h-0"
      >
        {messages.length === 0 && connected && (
          <p className="text-[11px] text-muted-foreground text-center py-8">
            {chatEnded
              ? "No messages were sent during this stream."
              : "No messages yet — say hello."}
          </p>
        )}
        {!connected && !error && enabled && (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <RiLoader4Line className="size-5 animate-spin text-emerald-400" />
            <p className="text-[11px]">Connecting to chat…</p>
          </div>
        )}
        {messages.map((m) => {
          const isSystem = m.userId === "system";
          const isSelf = me?.userId === m.userId;
          return (
            <div
              key={m.id}
              className={`group text-[12px] leading-snug ${
                isSystem
                  ? "text-center text-muted-foreground/80 italic text-[11px]"
                  : ""
              }`}
            >
              {!isSystem && (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span
                    className={`font-semibold ${
                      m.role === "owner"
                        ? "text-amber-400"
                        : isSelf
                        ? "text-emerald-400"
                        : "text-foreground/85"
                    }`}
                  >
                    {m.username}
                    {m.role === "owner" && (
                      <span className="ml-1 text-[9px] font-bold uppercase text-amber-400/80">
                        host
                      </span>
                    )}
                  </span>
                  <span className="text-foreground/90 break-words">{m.body}</span>
                  {showModActions &&
                    !chatEnded &&
                    onBanUser &&
                    m.role !== "owner" &&
                    !isSelf && (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 text-[9px] text-red-400 font-semibold ml-1"
                        onClick={() => onBanUser(m.userId, m.username)}
                      >
                        Ban
                      </button>
                    )}
                </div>
              )}
              {isSystem && <span>{m.body}</span>}
            </div>
          );
        })}
      </div>

      {error && !chatEnded && (
        <div className="px-3 py-2 border-t border-red-500/20 bg-red-500/5 text-[11px] text-red-400 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <RiWifiOffLine className="size-3.5 shrink-0" />
            <span className="truncate">{error}</span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] shrink-0"
            onClick={reconnect}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="border-t border-border/50 p-2.5 sm:p-3 space-y-2 shrink-0">
        {chatEnded ? (
          <div className="rounded-md border border-border/60 bg-[#121212]/60 px-3 py-3 text-center">
            <p className="text-[11px] font-semibold text-muted-foreground">
              Live chat has ended
            </p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">
              Messaging and reactions are closed for this stream.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={!canCompose}
                  onClick={() => sendReaction(emoji)}
                  className="size-8 rounded-md hover:bg-emerald-500/10 text-base disabled:opacity-40 transition-colors"
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  canCompose ? "Send a message…" : "Connecting…"
                }
                disabled={!canCompose}
                maxLength={500}
                className="h-9 text-xs supabase-input flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!canCompose || !draft.trim()}
                className="btn-primary-flat h-9 px-3"
              >
                <RiSendPlane2Line className="size-3.5" />
              </Button>
            </form>
            {role === "owner" && (
              <p className="text-[9px] text-muted-foreground font-mono">
                Host mode — you can moderate from the panel below
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
