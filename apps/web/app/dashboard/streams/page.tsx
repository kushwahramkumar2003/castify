"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { api, Stream } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiWifiOffLine,
  RiVideoLine,
  RiTimeLine,
  RiTeamLine,
  RiSearchLine,
  RiCalendarLine,
  RiAddLine,
  RiArrowRightSLine,
} from "react-icons/ri";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StreamRow({ stream }: { stream: Stream }) {
  const isReady = !stream.isLive && !stream.endedAt;

  return (
    <Link
      href={`/dashboard/streams/${stream.id}`}
      className="supabase-panel p-3 sm:p-4 flex items-center justify-between gap-2.5 sm:gap-4 transition-colors hover:bg-[#1a1a1a]/40 group min-w-0"
    >
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        <div
          className={`flex size-8 sm:size-9 shrink-0 items-center justify-center rounded text-muted-foreground ${
            stream.isLive
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : isReady
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-muted/30 border border-border/40"
          }`}
        >
          <RiVideoLine className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-semibold truncate text-foreground/90 group-hover:text-foreground transition-colors">
            {stream.title || "Untitled Broadcast"}
          </p>
          <div className="flex items-center gap-x-2 sm:gap-x-3.5 gap-y-1 mt-1 sm:mt-1.5 text-[10px] sm:text-xs text-muted-foreground flex-wrap font-mono">
            <span className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <RiCalendarLine className="size-3 sm:size-3.5 shrink-0" />
              <span className="truncate">{formatDate(stream.startedAt ?? stream.createdAt)}</span>
            </span>
            <span className="hidden sm:inline opacity-40">·</span>
            <span className="flex items-center gap-1 sm:gap-1.5">
              <RiTimeLine className="size-3 sm:size-3.5 shrink-0" />
              {stream.isLive ? "Live now" : formatDuration(stream.durationSecs)}
            </span>
            <span className="hidden sm:inline opacity-40">·</span>
            <span className="flex items-center gap-1 sm:gap-1.5">
              <RiTeamLine className="size-3 sm:size-3.5 shrink-0" />
              {stream.isLive || !stream.endedAt
                ? `${stream.currentViewers ?? 0} now · ${stream.peakViewers || 0} peak`
                : `${stream.peakViewers || 0} peak · ${stream.totalViews || 0} views`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <Badge
          variant="secondary"
          className={`rounded text-[8px] sm:text-[9px] font-bold px-1.5 sm:px-2 py-0.5 ${
            stream.isLive
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : isReady
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-neutral-800 text-neutral-400"
          }`}
        >
          {stream.isLive ? "LIVE" : isReady ? "READY" : "ENDED"}
        </Badge>
        <RiArrowRightSLine className="size-4 text-muted-foreground group-hover:text-foreground transition-colors hidden xs:block" />
      </div>
    </Link>
  );
}

export default function StreamsPage() {
  const [search, setSearch] = useState("");
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStreams = () => {
    api
      .getStreams()
      .then((res) => {
        if (res.data) setStreams(res.data);
      })
      .catch((err) => console.error("Failed to load streams", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStreams();
    const timer = setInterval(fetchStreams, 10000);
    return () => clearInterval(timer);
  }, []);

  const isLiveNow = streams.some((s) => s.isLive);

  const filtered = streams.filter((s) =>
    (s.title || "Untitled Stream").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Streams"
        description="Open a session or start something new."
        actions={
          <>
            {isLiveNow ? (
              <Badge className="hidden xs:inline-flex gap-1.5 px-2 py-0.5 text-[10px] font-semibold rounded border bg-red-500/10 text-red-400 border-red-500/20">
                <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </Badge>
            ) : (
              <Badge className="hidden sm:inline-flex gap-1 px-2 py-0.5 text-[10px] font-medium rounded border bg-transparent text-muted-foreground border-border/60">
                <RiWifiOffLine className="size-3" />
                Off-air
              </Badge>
            )}
            <Button size="sm" asChild className="btn-primary-flat gap-1.5">
              <Link href="/dashboard/streams/new">
                <RiAddLine className="size-3.5" />
                <span className="page-action-label">
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New broadcast</span>
                </span>
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="section-label">Broadcast Session Logs</h3>
          <div className="relative w-full sm:max-w-xs">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8a8a8a]" />
            <Input
              placeholder="Search session titles…"
              className="pl-9 h-9 text-sm bg-muted/20 supabase-input border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="bg-[#141414] p-1 rounded-md border border-border w-full sm:max-w-xs grid grid-cols-2 h-auto">
            <TabsTrigger
              value="all"
              className="px-3 py-2 text-xs font-semibold rounded data-[state=active]:text-emerald-400"
            >
              All Sessions
            </TabsTrigger>
            <TabsTrigger
              value="recorded"
              className="px-3 py-2 text-xs font-semibold rounded data-[state=active]:text-emerald-400"
            >
              Recorded
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
            {loading ? (
              <div className="supabase-panel empty-state">
                <p className="text-xs text-muted-foreground animate-pulse">
                  Syncing broadcast logs…
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="supabase-panel empty-state">
                <div className="flex size-12 items-center justify-center rounded-md mb-3 bg-muted/20 border border-border">
                  <RiVideoLine className="size-5 opacity-40" />
                </div>
                <p className="text-sm font-bold">No sessions logged</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-xs">
                  {search
                    ? "No sessions match your search."
                    : "Create a new broadcast to get your RTMP credentials."}
                </p>
                {!search && (
                  <Button size="sm" asChild className="btn-primary-flat h-9 text-xs">
                    <Link href="/dashboard/streams/new">Start New Broadcast</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filtered.map((s) => (
                  <StreamRow key={s.id} stream={s} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recorded" className="mt-3">
            {filtered.filter((s) => s.endedAt && !s.isLive).length === 0 ? (
              <div className="supabase-panel empty-state">
                <div className="flex size-12 items-center justify-center rounded-md mb-3 bg-muted/20 border border-border">
                  <RiVideoLine className="size-5 opacity-40" />
                </div>
                <p className="text-sm font-bold">No recorded sessions</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Ended broadcasts appear here after you permanently end a session.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filtered
                  .filter((s) => s.endedAt && !s.isLive)
                  .map((s) => (
                    <StreamRow key={s.id} stream={s} />
                  ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}