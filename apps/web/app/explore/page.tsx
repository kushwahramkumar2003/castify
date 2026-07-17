"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/auth/require-auth";
import { api, type BrowseStreamCard } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RiSearchLine,
  RiLiveLine,
  RiUserHeartLine,
  RiArrowRightSLine,
  RiVideoLine,
} from "react-icons/ri";
import { StreamCardMedia } from "@/components/viewer/stream-card-media";

function StreamCard({ s }: { s: BrowseStreamCard }) {
  return (
    <Link
      href={`/watch/${s.id}`}
      className="supabase-panel supabase-panel-interactive p-3 sm:p-4 flex flex-col gap-3 min-w-0 group"
    >
      <StreamCardMedia
        thumbnailUrl={s.thumbnailUrl}
        isLive={s.isLive}
        title={s.title}
      />

      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate group-hover:text-emerald-400 transition-colors">
            {s.title || "Untitled stream"}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
            @{s.creator.username}
            {typeof s.currentViewers === "number" && s.isLive
              ? ` · ${s.currentViewers} watching`
              : ""}
          </p>
        </div>
        {!s.isLive && (
          <Badge
            className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded border ${
              s.endedAt
                ? "bg-neutral-800 text-neutral-400 border-border"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
            }`}
          >
            {s.endedAt ? "ENDED" : "READY"}
          </Badge>
        )}
      </div>

      {s.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {s.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/50"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t border-border/40">
        <span>
          {(s.qualities?.length ? s.qualities : ["720p"]).join(" · ")}
        </span>
        <span className="flex items-center gap-1 text-emerald-400/80 group-hover:text-emerald-400">
          Watch <RiArrowRightSLine className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}

function ExploreInner() {
  const [q, setQ] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [streams, setStreams] = useState<BrowseStreamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.browseStreams({
        q: q.trim() || undefined,
        live: liveOnly,
        following: followingOnly,
      });
      setStreams(res.data ?? []);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to load streams";
      setError(msg);
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, [q, liveOnly, followingOnly]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  // Soft poll for live updates
  useEffect(() => {
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <div className="page-header">
        <div className="page-header__main">
          <div className="page-header__row">
            <h1 className="page-title">Explore</h1>
          </div>
          <p className="page-subtitle">
            Discover live and upcoming public broadcasts. Sign-in required.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, tag, or creator…"
            className="pl-9 h-10 text-sm supabase-input bg-muted/20 border-border"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant={liveOnly ? "default" : "secondary"}
            className={`h-9 text-xs gap-1.5 ${
              liveOnly ? "btn-primary-flat" : "btn-secondary-flat"
            }`}
            onClick={() => setLiveOnly((v) => !v)}
          >
            <RiLiveLine className="size-3.5" /> Live only
          </Button>
          <Button
            type="button"
            size="sm"
            variant={followingOnly ? "default" : "secondary"}
            className={`h-9 text-xs gap-1.5 ${
              followingOnly ? "btn-primary-flat" : "btn-secondary-flat"
            }`}
            onClick={() => setFollowingOnly((v) => !v)}
          >
            <RiUserHeartLine className="size-3.5" /> Following
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="supabase-panel empty-state">
          <p className="text-xs text-muted-foreground animate-pulse">
            Loading streams…
          </p>
        </div>
      ) : error ? (
        <div className="supabase-panel empty-state space-y-2">
          <p className="text-sm font-semibold">{error}</p>
          <Button size="sm" className="btn-secondary-flat h-8 text-xs" onClick={load}>
            Retry
          </Button>
        </div>
      ) : streams.length === 0 ? (
        <div className="supabase-panel empty-state">
          <div className="flex size-12 items-center justify-center rounded-md mb-3 bg-muted/20 border border-border">
            <RiVideoLine className="size-5 opacity-40" />
          </div>
          <p className="text-sm font-bold">No streams found</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {followingOnly
              ? "Follow creators to see their sessions here."
              : "Try a different search, or check back when someone goes live."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {streams.map((s) => (
            <StreamCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <RequireAuth>
      <ExploreInner />
    </RequireAuth>
  );
}
