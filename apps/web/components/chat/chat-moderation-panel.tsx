"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { chatApi } from "@/lib/chat-client";
import {
  RiShieldUserLine,
  RiAddLine,
  RiDeleteBinLine,
  RiLoader4Line,
  RiProhibitedLine,
  RiUserUnfollowLine,
  RiUserFollowLine,
  RiRefreshLine,
} from "react-icons/ri";

interface BanRow {
  id: string;
  userId: string;
  username: string;
  reason: string | null;
  expiresAt: string | null;
}

interface WordRow {
  id: string;
  word: string;
}

interface ChatModerationPanelProps {
  streamId: string;
  /** Bump after ban/unban from chat to reload lists */
  refreshKey?: number;
}

export function ChatModerationPanel({
  streamId,
  refreshKey = 0,
}: ChatModerationPanelProps) {
  const [bans, setBans] = useState<BanRow[]>([]);
  const [words, setWords] = useState<WordRow[]>([]);
  const [wordDraft, setWordDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, w] = await Promise.all([
        chatApi.listBans(streamId),
        chatApi.listWords(streamId),
      ]);
      setBans(b as BanRow[]);
      setWords(w as WordRow[]);
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to load moderation"
      );
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  const addWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = wordDraft.trim();
    if (word.length < 2) return;
    setBusy(true);
    try {
      await chatApi.addWord(streamId, word);
      setWordDraft("");
      toast.success("Blocked word added");
      await load();
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Could not add word"
      );
    } finally {
      setBusy(false);
    }
  };

  const removeWord = async (id: string) => {
    setBusy(true);
    try {
      await chatApi.removeWord(streamId, id);
      toast.success("Word removed");
      await load();
    } catch {
      toast.error("Could not remove word");
    } finally {
      setBusy(false);
    }
  };

  const unban = async (userId: string, username: string) => {
    setUnbanningId(userId);
    setBusy(true);
    try {
      await chatApi.unbanUser(streamId, userId);
      toast.success(`@${username} can chat again`);
      await load();
    } catch {
      toast.error("Could not unban user");
    } finally {
      setBusy(false);
      setUnbanningId(null);
    }
  };

  return (
    <div className="supabase-panel p-4 sm:p-5 space-y-5">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-7 items-center justify-center rounded bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0">
            <RiShieldUserLine className="size-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Chat moderation
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Block words · ban & unban viewers
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-[10px] gap-1 shrink-0"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          disabled={busy}
        >
          <RiRefreshLine className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-[11px] text-muted-foreground flex items-center gap-2">
          <RiLoader4Line className="size-3.5 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="section-label font-mono">Banned from chat</span>
              {bans.length > 0 && (
                <Badge className="text-[9px] font-bold bg-red-500/10 text-red-400 border-red-500/25">
                  {bans.length}
                </Badge>
              )}
            </div>

            {bans.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-[#121212]/40 px-3 py-4 text-center">
                <RiUserFollowLine className="size-5 text-muted-foreground/50 mx-auto mb-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  No banned users. Hover a chat message and click{" "}
                  <span className="text-red-400 font-semibold">Ban</span> to
                  remove someone.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/50 rounded-md border border-border/50 overflow-hidden">
                {bans.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#121212]/50"
                  >
                    <div className="min-w-0 flex items-start gap-2">
                      <RiUserUnfollowLine className="size-4 text-red-400/80 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">
                          @{b.username}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {b.reason || "Banned by host"}
                          {b.expiresAt
                            ? ` · until ${new Date(b.expiresAt).toLocaleString()}`
                            : " · permanent"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => unban(b.userId, b.username)}
                      className="btn-primary-flat h-8 text-[10px] gap-1.5 shrink-0 px-2.5"
                    >
                      {unbanningId === b.userId ? (
                        <RiLoader4Line className="size-3.5 animate-spin" />
                      ) : (
                        <RiUserFollowLine className="size-3.5" />
                      )}
                      Unban
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <span className="section-label font-mono">Blocked words</span>
            <form onSubmit={addWord} className="flex gap-2">
              <Input
                value={wordDraft}
                onChange={(e) => setWordDraft(e.target.value)}
                placeholder="e.g. spam"
                className="h-9 text-xs supabase-input flex-1"
                maxLength={50}
              />
              <Button
                type="submit"
                size="sm"
                disabled={busy || wordDraft.trim().length < 2}
                className="btn-secondary-flat h-9 gap-1 text-xs"
              >
                <RiAddLine className="size-3.5" />
                Add
              </Button>
            </form>
            {words.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No blocked words yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {words.map((w) => (
                  <li key={w.id}>
                    <Badge
                      variant="secondary"
                      className="gap-1.5 text-[10px] font-mono pl-2 pr-1 py-1"
                    >
                      {w.word}
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                        onClick={() => removeWord(w.id)}
                        aria-label={`Remove ${w.word}`}
                      >
                        <RiDeleteBinLine className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
            <RiProhibitedLine className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
            Ban kicks them from chat immediately. Use{" "}
            <strong className="text-foreground/80">Unban</strong> above to let
            them rejoin and chat again.
          </p>
        </>
      )}
    </div>
  );
}
