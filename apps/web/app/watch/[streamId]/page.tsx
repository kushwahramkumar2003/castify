"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { HlsViewerPlayer } from "@/components/viewer/hls-viewer-player";
import { api, type BrowseStreamDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  RiUserAddLine,
  RiUserUnfollowLine,
  RiExternalLinkLine,
  RiArrowLeftLine,
  RiLoader4Line,
  RiShareLine,
} from "react-icons/ri";
import { LiveChatPanel } from "@/components/chat/live-chat-panel";
import { ChatModerationPanel } from "@/components/chat/chat-moderation-panel";
import { chatApi } from "@/lib/chat-client";

function WatchInner() {
  const params = useParams();
  const streamId = params.streamId as string;
  const router = useRouter();
  const { user } = useAuth();
  const confirm = useConfirm();

  const [data, setData] = useState<BrowseStreamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [modRefreshKey, setModRefreshKey] = useState(0);
  const prevLiveRef = useState<{ v: boolean }>({ v: false })[0];

  const load = useCallback(
    async (silent = false) => {
      if (!streamId) return;
      if (!silent) setLoading(true);
      try {
        const res = await api.browseStream(streamId);
        setData(res.data);
        setError(null);
        const nowLive = !!res.data.stream.isLive;
        if (nowLive && !prevLiveRef.v) {
          setReloadToken((t) => t + 1);
        }
        prevLiveRef.v = nowLive;
      } catch (err: unknown) {
        const status =
          err && typeof err === "object" && "status" in err
            ? (err as { status?: number }).status
            : undefined;
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to load stream";
        if (status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/watch/${streamId}`)}`);
          return;
        }
        setError(msg);
        if (!silent) setData(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [streamId, router, prevLiveRef]
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 4000);
    return () => clearInterval(t);
  }, [load]);

  // Concurrent viewer presence — heartbeat every 10s while on this page
  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;

    const ping = () => {
      if (cancelled) return;
      api.streamHeartbeat(streamId).catch(() => {
        /* non-fatal */
      });
    };

    ping();
    const t = setInterval(ping, 10_000);

    const leave = () => {
      const base =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
      // keepalive so the request can finish during unload; cookies included
      void fetch(`${base}/browse/streams/${streamId}/leave`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("pagehide", leave);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [streamId]);

  const toggleFollow = async () => {
    if (!data?.creator) return;
    setFollowBusy(true);
    try {
      if (data.isFollowing) {
        await api.unfollow(data.creator.username);
        setData((d) =>
          d
            ? {
                ...d,
                isFollowing: false,
                creator: {
                  ...d.creator,
                  followerCount: Math.max(0, d.creator.followerCount - 1),
                },
              }
            : d
        );
        toast.success(`Unfollowed @${data.creator.username}`);
      } else {
        await api.follow(data.creator.username);
        setData((d) =>
          d
            ? {
                ...d,
                isFollowing: true,
                creator: {
                  ...d.creator,
                  followerCount: d.creator.followerCount + 1,
                },
              }
            : d
        );
        toast.success(`Following @${data.creator.username}`);
      }
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Follow action failed"
      );
    } finally {
      setFollowBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Stream link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (loading) {
    return (
      <div className="supabase-panel empty-state">
        <p className="text-xs text-muted-foreground animate-pulse">
          Loading stream…
        </p>
      </div>
    );
  }

  if (error || !data) {
    const isPrivate =
      error?.toLowerCase().includes("private") ||
      error?.toLowerCase().includes("invite");
    return (
      <div className="supabase-panel empty-state space-y-3 max-w-lg mx-auto">
        <p className="text-sm font-bold">{error || "Stream not found"}</p>
        {isPrivate && (
          <p className="text-xs text-muted-foreground">
            Redeem the creator&apos;s invite code to unlock this stream.
          </p>
        )}
        <div className="flex flex-wrap gap-2 justify-center">
          {isPrivate && (
            <Button size="sm" className="btn-primary-flat h-8 text-xs" asChild>
              <Link href="/library?tab=join">Join with code</Link>
            </Button>
          )}
          <Button size="sm" className="btn-secondary-flat h-8 text-xs" asChild>
            <Link href="/library">Library</Link>
          </Button>
          <Button size="sm" className="btn-secondary-flat h-8 text-xs" onClick={() => load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { stream, creator, playback, isFollowing, isOwner } = data;
  const initials = creator.fullName
    ? creator.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : creator.username[0]?.toUpperCase() ?? "?";

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-up min-w-0 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href="/explore" aria-label="Back to explore">
            <RiArrowLeftLine className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
            {stream.title || "Untitled stream"}
          </h1>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            /watch/{stream.id}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="btn-secondary-flat h-8 text-xs gap-1.5 shrink-0"
          onClick={copyLink}
        >
          <RiShareLine className="size-3.5" />
          <span className="hidden xs:inline">Share</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="lg:col-span-3 min-w-0 space-y-3">
          <HlsViewerPlayer
            masterUrl={playback.masterUrl}
            qualityUrls={playback.qualityUrls}
            qualities={
              playback.qualities?.length ? playback.qualities : stream.qualities
            }
            isLive={stream.isLive}
            title={stream.title ?? undefined}
            reloadToken={reloadToken}
          />
        </div>
        <div className="lg:col-span-2 min-w-0 space-y-3">
          <LiveChatPanel
            streamId={stream.id}
            streamEnded={!!stream.endedAt}
            showModActions={isOwner && !stream.endedAt}
            onBanUser={async (userId, username) => {
              const ok = await confirm({
                title: `Ban @${username}?`,
                description:
                  "They will not be able to send chat messages on this stream until you unban them.",
                confirmLabel: "Ban user",
                cancelLabel: "Cancel",
                variant: "destructive",
              });
              if (!ok) return;
              try {
                await chatApi.banUser(stream.id, {
                  userId,
                  reason: "Banned by host",
                });
                toast.success(`Banned @${username} — unban in moderation`);
                setModRefreshKey((k) => k + 1);
              } catch (err: unknown) {
                toast.error(
                  err && typeof err === "object" && "message" in err
                    ? String((err as { message: string }).message)
                    : "Ban failed"
                );
              }
            }}
          />
          {isOwner && !stream.endedAt && (
            <ChatModerationPanel
              streamId={stream.id}
              refreshKey={modRefreshKey}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="md:col-span-2 supabase-panel p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                stream.isLive
                  ? "bg-red-500/15 text-red-400 border-red-500/30"
                  : stream.endedAt
                  ? "bg-neutral-800 text-neutral-400"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              }`}
            >
              {stream.isLive ? "LIVE" : stream.endedAt ? "ENDED" : "READY"}
            </Badge>
            {(playback.qualities?.length
              ? playback.qualities
              : stream.qualities
            )?.map((q) => (
              <span
                key={q}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground"
              >
                {q}
              </span>
            ))}
          </div>

          {stream.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stream.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/8 text-emerald-400/90 border border-emerald-500/15"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed">
            {stream.isLive
              ? "You're watching live. Chat with the community on the right — keep it kind."
              : stream.endedAt
              ? "This broadcast has ended. You can still open recordings from Library when available."
              : "The creator hasn't gone live yet. Hang tight or check back soon."}
          </p>

          <div className="flex flex-wrap gap-3 pt-1 text-[11px] font-mono text-muted-foreground">
            <span>
              <span className="text-emerald-400 font-semibold">
                {stream.currentViewers ?? 0}
              </span>{" "}
              watching
            </span>
            <span>
              <span className="text-foreground/80 font-semibold">
                {stream.peakViewers ?? 0}
              </span>{" "}
              peak
            </span>
            <span>
              <span className="text-foreground/80 font-semibold">
                {stream.totalViews ?? 0}
              </span>{" "}
              views
            </span>
          </div>
        </div>

        <div className="supabase-panel p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-11 rounded-md border border-border shrink-0">
              {creator.avatarUrl && (
                <AvatarImage src={creator.avatarUrl} alt={creator.username} referrerPolicy="no-referrer" />
              )}
              <AvatarFallback className="rounded-md text-sm font-bold bg-[#1a1a1a] text-emerald-400">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Link
                href={`/u/${creator.username}`}
                className="text-sm font-semibold truncate block hover:text-emerald-400 transition-colors"
              >
                {creator.fullName || creator.username}
              </Link>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                @{creator.username} · {creator.followerCount} followers
              </p>
            </div>
          </div>

          {creator.bio && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {creator.bio}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {!isOwner && user?.username !== creator.username && (
              <Button
                size="sm"
                disabled={followBusy}
                onClick={toggleFollow}
                className={`h-9 text-xs gap-1.5 w-full ${
                  isFollowing ? "btn-secondary-flat" : "btn-primary-flat"
                }`}
              >
                {followBusy ? (
                  <RiLoader4Line className="size-3.5 spin" />
                ) : isFollowing ? (
                  <RiUserUnfollowLine className="size-3.5" />
                ) : (
                  <RiUserAddLine className="size-3.5" />
                )}
                {isFollowing ? "Unfollow" : "Follow"}
              </Button>
            )}
            {isOwner && (
              <Button size="sm" className="btn-secondary-flat h-9 text-xs gap-1.5 w-full" asChild>
                <Link href={`/dashboard/streams/${stream.id}`}>
                  Open Studio <RiExternalLinkLine className="size-3.5" />
                </Link>
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-9 text-xs w-full" asChild>
              <Link href={`/u/${creator.username}`}>View profile</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <RequireAuth>
      <WatchInner />
    </RequireAuth>
  );
}
