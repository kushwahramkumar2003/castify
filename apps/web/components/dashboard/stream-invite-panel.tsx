"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StreamInviteRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getAppOrigin, joinUrl, watchUrl } from "@/lib/app-url";
import {
  RiKey2Line,
  RiAddLine,
  RiLoader4Line,
  RiFileCopyLine,
  RiDeleteBinLine,
  RiLinkM,
  RiShareLine,
  RiCheckboxCircleLine,
  RiInformationLine,
} from "react-icons/ri";

export function StreamInvitePanel({
  streamId,
  isPrivate = false,
}: {
  streamId: string;
  isPrivate?: boolean;
}) {
  const [invites, setInvites] = useState<StreamInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastKind, setLastKind] = useState<"CODE" | "LINK" | null>(null);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const publicWatch = watchUrl(streamId);
  const origin = getAppOrigin();

  const load = useCallback(async () => {
    try {
      const res = await api.listStreamInvites(streamId);
      setInvites(res.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (kind: "CODE" | "LINK") => {
    setCreating(true);
    try {
      const res = await api.createStreamInvite(streamId, {
        kind,
        label: label.trim() || undefined,
      });
      setLastCode(res.data.code);
      setLastKind(kind);
      setLabel("");
      toast.success(
        kind === "CODE"
          ? "Invite code created — copy it now"
          : "Invite link token created — copy the link now"
      );
      await load();
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to create invite"
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (inviteId: string) => {
    try {
      await api.revokeStreamInvite(streamId, inviteId);
      toast.success("Invite revoked");
      await load();
    } catch {
      toast.error("Failed to revoke");
    }
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };

  const lastJoinLink = lastCode ? joinUrl(lastCode) : null;

  return (
    <div className="supabase-panel p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-7 items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0">
            <RiShareLine className="size-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Share & invites
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
              Links use this environment:{" "}
              <span className="font-mono text-emerald-400/90">{origin}</span>
            </p>
          </div>
        </div>
        <Badge
          className={`text-[9px] font-bold shrink-0 ${
            isPrivate
              ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
          }`}
        >
          {isPrivate ? "PRIVATE" : "PUBLIC"}
        </Badge>
      </div>

      {/* Public watch link */}
      <div className="space-y-1.5">
        <span className="section-label font-mono">Watch link</span>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <code
            className="flex-1 text-[11px] sm:text-xs font-mono break-all select-all rounded-md px-3 py-2.5 min-w-0"
            style={{
              background: "#121212",
              border: "1px solid var(--border)",
              color: "#ededed",
            }}
          >
            {publicWatch}
          </code>
          <Button
            size="sm"
            variant="secondary"
            className="btn-secondary-flat h-9 gap-1.5 text-[10px] shrink-0"
            onClick={() => copy(publicWatch, "watch")}
          >
            {copied === "watch" ? (
              <RiCheckboxCircleLine className="size-3.5 text-emerald-400" />
            ) : (
              <RiFileCopyLine className="size-3.5" />
            )}
            Copy link
          </Button>
        </div>
        {isPrivate ? (
          <p className="text-[10px] text-amber-400/90 flex items-start gap-1.5 leading-relaxed">
            <RiInformationLine className="size-3.5 shrink-0 mt-0.5" />
            Private stream: viewers need an invite code below (must be logged in).
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Anyone logged in can open this public session. Share the invite code
            for private-only guests.
          </p>
        )}
      </div>

      {/* Fresh invite flash */}
      {lastCode && lastJoinLink && (
        <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3.5 space-y-3 animate-fade-up">
          <div className="flex items-center gap-2">
            <RiKey2Line className="size-4 text-emerald-400" />
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              New {lastKind === "LINK" ? "invite link" : "invite code"} — shown once
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider">
              Code
            </span>
            <div className="flex gap-2">
              <code className="flex-1 text-sm font-mono font-bold tracking-wide break-all rounded-md px-3 py-2 bg-[#111] border border-border">
                {lastCode}
              </code>
              <Button
                size="sm"
                className="btn-primary-flat h-auto px-3 shrink-0"
                onClick={() => copy(lastCode, "code")}
              >
                {copied === "code" ? (
                  <RiCheckboxCircleLine className="size-3.5" />
                ) : (
                  <RiFileCopyLine className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider">
              Join link
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 text-[11px] font-mono break-all rounded-md px-3 py-2 bg-[#111] border border-border text-foreground/90">
                {lastJoinLink}
              </code>
              <Button
                size="sm"
                variant="secondary"
                className="btn-secondary-flat h-9 gap-1.5 text-[10px] shrink-0"
                onClick={() => copy(lastJoinLink, "join")}
              >
                {copied === "join" ? (
                  <RiCheckboxCircleLine className="size-3.5 text-emerald-400" />
                ) : (
                  <RiLinkM className="size-3.5" />
                )}
                Copy join link
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create */}
      <div className="space-y-2 pt-1">
        <span className="section-label font-mono">Generate invite</span>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Label (optional) — e.g. Discord friends"
            className="h-9 text-xs supabase-input flex-1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button
            size="sm"
            disabled={creating}
            onClick={() => create("CODE")}
            className="btn-primary-flat h-9 text-xs gap-1.5"
          >
            {creating ? (
              <RiLoader4Line className="size-3.5 spin" />
            ) : (
              <RiAddLine className="size-3.5" />
            )}
            Short code
          </Button>
          <Button
            size="sm"
            disabled={creating}
            onClick={() => create("LINK")}
            className="btn-secondary-flat h-9 text-xs gap-1.5"
          >
            <RiLinkM className="size-3.5" />
            Long token
          </Button>
        </div>
      </div>

      {/* History */}
      <div className="space-y-2">
        <span className="section-label font-mono">Active invites</span>
        {loading ? (
          <p className="text-[11px] text-muted-foreground animate-pulse py-2">
            Loading…
          </p>
        ) : invites.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 bg-[#141414]/40 px-3 py-5 text-center">
            <p className="text-[11px] text-muted-foreground">
              No invites yet. Generate a short code for private viewers.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50 rounded-md border border-border/50 overflow-hidden">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="px-3 py-2.5 flex items-center justify-between gap-2 min-w-0 bg-[#121212]/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] text-foreground/90">
                      {inv.codeHint ? `${inv.codeHint}…` : inv.kind}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[8px] font-bold rounded px-1.5 py-0"
                    >
                      {inv.kind}
                    </Badge>
                    {inv.revokedAt && (
                      <Badge className="text-[8px] bg-red-500/10 text-red-400 border-red-500/20">
                        REVOKED
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {inv.label || "Untitled"} · used {inv.useCount}
                    {inv.maxUses != null ? `/${inv.maxUses}` : ""}
                  </p>
                </div>
                {!inv.revokedAt && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-red-400 hover:bg-red-500/10"
                    onClick={() => revoke(inv.id)}
                    aria-label="Revoke"
                  >
                    <RiDeleteBinLine className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
