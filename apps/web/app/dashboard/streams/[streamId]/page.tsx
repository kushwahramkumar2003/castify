"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, Stream, StreamKey, Vod } from "@/lib/api";
import { toast } from "sonner";

const StreamPlayerMonitor = dynamic(
  () =>
    import("@/components/dashboard/stream-player").then((m) => m.StreamPlayerMonitor),
  {
    ssr: false,
    loading: () => (
      <div className="supabase-panel p-12 sm:p-16 flex items-center justify-center min-h-[280px] sm:min-h-[380px]">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
          <p className="text-xs text-muted-foreground">Loading player…</p>
        </div>
      </div>
    ),
  }
);
import { PageHeader } from "@/components/dashboard/page-header";
import { StreamInvitePanel } from "@/components/dashboard/stream-invite-panel";
import {
  RiArrowLeftLine,
  RiTimeLine,
  RiTeamLine,
  RiEyeLine,
  RiEyeOffLine,
  RiFileCopyLine,
  RiRefreshLine,
  RiStopCircleLine,
  RiKeyLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiLoader4Line,
} from "react-icons/ri";

const GREEN = "#3ecf8e";
const RTMP_SERVER = "rtmp://localhost:1935/live";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
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

function StreamKeyPanel({
  streamKey,
  canRotate,
  onRotate,
  rotating,
}: {
  streamKey: StreamKey | null;
  canRotate: boolean;
  onRotate: () => void;
  rotating: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!streamKey) {
    return (
      <div className="supabase-panel empty-state">
        <div className="flex size-12 items-center justify-center rounded-md mb-3 bg-muted/20 border border-border">
          <RiKeyLine className="size-5 opacity-40" />
        </div>
        <p className="text-sm font-bold">
          {canRotate ? "No active key" : "Keys revoked"}
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          {canRotate
            ? "Rotate to generate a new ingest credential for OBS."
            : "Stream keys were revoked when this broadcast ended."}
        </p>
        {canRotate && (
          <Button
            size="sm"
            onClick={onRotate}
            disabled={rotating}
            className="btn-primary-flat h-9 text-xs mt-4 gap-1.5"
          >
            <RiRefreshLine className={`size-3.5 ${rotating ? "spin" : ""}`} />
            Generate Key
          </Button>
        )}
      </div>
    );
  }

  const maskedKey =
    streamKey.key.length > 12
      ? `${streamKey.key.slice(0, 6)}${"•".repeat(16)}${streamKey.key.slice(-4)}`
      : "••••••••••••";

  const handleCopy = async (text: string, kind: "key" | "url") => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "key") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Stream key copied");
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
        toast.success("Server URL copied");
      }
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };

  return (
    <div className="supabase-panel p-4 sm:p-5 space-y-4">
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-7 items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0">
            <RiKeyLine className="size-3.5" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
            Ingest Credentials
          </h3>
        </div>
        {canRotate && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRotate}
            disabled={rotating}
            className="btn-secondary-flat h-8 text-[10px] gap-1 w-full xs:w-auto"
          >
            <RiRefreshLine className={`size-3 ${rotating ? "spin" : ""}`} />
            Rotate Key
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <code
            className="flex-1 text-[11px] sm:text-xs font-mono break-all select-all rounded-md px-3 py-2.5 min-w-0"
            style={{
              background: "#121212",
              border: "1px solid var(--border)",
              color: visible ? "#ededed" : "#8a8a8a",
              letterSpacing: visible ? "normal" : "0.06em",
            }}
          >
            {visible ? streamKey.key : maskedKey}
          </code>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              className="btn-secondary-flat gap-1 text-[10px] h-9 px-2.5 flex-1 sm:flex-initial"
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <RiEyeOffLine className="size-3.5" /> : <RiEyeLine className="size-3.5" />}
              {visible ? "Hide" : "Reveal"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => handleCopy(streamKey.key, "key")}
              title="Copy key"
              aria-label="Copy stream key"
            >
              {copied ? (
                <RiCheckboxCircleLine className="size-4 text-emerald-400" />
              ) : (
                <RiFileCopyLine className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {visible && (
          <div className="grid sm:grid-cols-2 gap-3 pt-1 animate-fade-up">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="section-label">Server URL</span>
                <button
                  type="button"
                  onClick={() => handleCopy(RTMP_SERVER, "url")}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  {copiedUrl ? (
                    <RiCheckboxCircleLine className="size-3" />
                  ) : (
                    <RiFileCopyLine className="size-3" />
                  )}
                  {copiedUrl ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="p-2.5 rounded-md bg-[#111] border border-border text-[10px] sm:text-[11px] font-mono break-all">
                {RTMP_SERVER}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="section-label">Key Label</span>
              <div className="p-2.5 rounded-md bg-[#111] border border-border text-[10px] sm:text-[11px] font-mono truncate">
                {streamKey.label ?? "Default"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StreamStudioPage() {
  const params = useParams();
  const streamId = params.streamId as string;

  const [stream, setStream] = useState<Stream | null>(null);
  const [streamKeys, setStreamKeys] = useState<StreamKey[]>([]);
  const [vod, setVod] = useState<Vod | null>(null);
  const [currentViewers, setCurrentViewers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [liveEpoch, setLiveEpoch] = useState(0);
  const prevLiveRef = useRef(false);

  const fetchDetail = useCallback(
    (silent = false) => {
      if (!streamId) return;
      api
        .getStream(streamId)
        .then((res) => {
          if (res.data) {
            setStream(res.data.stream);
            setStreamKeys(res.data.streamKeys);
            setVod(res.data.vod);
            setCurrentViewers(
              res.data.currentViewers ??
                res.data.stream.currentViewers ??
                0
            );
          }
        })
        .catch(() => {
          if (!silent) toast.error("Failed to load stream — is auth-service running?");
        })
        .finally(() => setLoading(false));
    },
    [streamId]
  );

  useEffect(() => {
    if (!streamId) return;
    fetchDetail();
    // Poll faster so OBS stop/start updates the player within ~2s
    const timer = setInterval(() => fetchDetail(true), 2000);
    return () => clearInterval(timer);
  }, [streamId, fetchDetail]);

  useEffect(() => {
    if (!stream?.isLive || !stream.startedAt) {
      setLiveElapsed(0);
      return;
    }
    const start = new Date(stream.startedAt).getTime();
    const tick = () => setLiveElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [stream?.isLive, stream?.startedAt]);

  // OBS reconnect: force player to re-bind HLS when isLive goes false → true
  useEffect(() => {
    const nowLive = !!stream?.isLive;
    if (nowLive && !prevLiveRef.current) {
      setLiveEpoch((e) => e + 1);
    }
    prevLiveRef.current = nowLive;
  }, [stream?.isLive]);

  const isEnded = !!stream?.endedAt && !stream?.isLive;
  const isReady = stream && !stream.isLive && !stream.endedAt;
  const activeKey = streamKeys[0] ?? null;

  const playerMode = stream?.isLive
    ? "live"
    : vod?.playlistUrl && vod.status === "READY"
    ? "vod"
    : isEnded
    ? "offline"
    : "live";

  const handleEndStream = async () => {
    if (!confirm("End this broadcast? All ingest keys will be revoked immediately.")) return;
    setEnding(true);
    try {
      const res = await api.endStream(streamId);
      if (res.data) {
        setStream(res.data.stream);
        setVod(res.data.vod);
        setStreamKeys([]);
        toast.success("Broadcast ended — keys revoked");
      }
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to end stream"
      );
    } finally {
      setEnding(false);
    }
  };

  const handleRotateKey = async () => {
    if (
      !confirm("Rotate stream key? The current key will stop working on next OBS reconnect.")
    )
      return;
    setRotating(true);
    try {
      const res = await api.rotateStreamKey(streamId);
      setStreamKeys([res.data]);
      toast.success("Stream key rotated");
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to rotate key"
      );
    } finally {
      setRotating(false);
    }
  };

  if (!streamId) {
    return (
      <div className="supabase-panel empty-state animate-fade-up">
        <p className="text-sm font-bold">Invalid stream URL</p>
        <Button size="sm" asChild className="btn-primary-flat h-9 text-xs mt-4">
          <Link href="/dashboard/streams">Back to Sessions</Link>
        </Button>
      </div>
    );
  }

  if (!loading && !stream) {
    return (
      <div className="supabase-panel empty-state animate-fade-up">
        <p className="text-sm font-bold">Stream not found</p>
        <p className="text-xs text-muted-foreground mt-1">
          This session may have been removed or you lack access.
        </p>
        <Button size="sm" asChild className="btn-primary-flat h-9 text-xs mt-4">
          <Link href="/dashboard/streams">Back to Sessions</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        leading={
          <Button variant="ghost" size="icon" asChild aria-label="Back to streams">
            <Link href="/dashboard/streams">
              <RiArrowLeftLine className="size-4" />
            </Link>
          </Button>
        }
        title={loading ? "Studio" : stream?.title || "Untitled broadcast"}
        description={
          !loading && stream
            ? stream.isLive
              ? "Live now"
              : isReady
              ? "Ready for OBS"
              : "Broadcast ended"
            : undefined
        }
        actions={
          <>
            {!loading && stream && (
              <Badge
                className={`rounded text-[9px] font-bold px-2 py-0.5 ${
                  stream.isLive
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : isReady
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {stream.isLive ? "LIVE" : isReady ? "READY" : "ENDED"}
              </Badge>
            )}
            {!loading && stream && (stream.isLive || isReady) && (
              <Button
                size="sm"
                onClick={handleEndStream}
                disabled={ending}
                className="btn-secondary-flat gap-1.5 text-red-400 border-red-500/25 hover:bg-red-500/10"
              >
                {ending ? (
                  <RiLoader4Line className="size-3.5 spin" />
                ) : (
                  <RiStopCircleLine className="size-3.5" />
                )}
                <span className="page-action-label">
                  {ending ? "Ending…" : "End"}
                </span>
              </Button>
            )}
          </>
        }
      />

      {!loading && stream && (
        <StreamPlayerMonitor
          mode={playerMode}
          streamKey={!isEnded ? activeKey?.key : null}
          vodUrl={vod?.playlistUrl ?? null}
          title={stream.title ?? undefined}
          onRefresh={() => fetchDetail(true)}
          isLive={!!stream.isLive}
          liveEpoch={liveEpoch}
        />
      )}

      {loading && (
        <div className="supabase-panel p-12 sm:p-16 flex items-center justify-center min-h-[200px]">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-xs text-muted-foreground">Fetching stream data…</p>
          </div>
        </div>
      )}

      {!loading && stream && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {[
              {
                label: "Watching now",
                value: String(
                  stream.endedAt
                    ? 0
                    : (stream.currentViewers ?? currentViewers ?? 0)
                ),
                icon: RiTeamLine,
                color: (stream.currentViewers ?? currentViewers) > 0 ? "#3ecf8e" : "#828282",
              },
              {
                label: "Peak Viewers",
                value: String(stream.peakViewers ?? 0),
                icon: RiTeamLine,
                color: "#1998d5",
              },
              {
                label: "Total Views",
                value: String(stream.totalViews ?? 0),
                icon: RiEyeLine,
                color: "#8a5cfa",
              },
              {
                label: stream.isLive ? "Duration" : "Started",
                value: stream.isLive
                  ? formatDuration(liveElapsed)
                  : formatDate(stream.startedAt ?? stream.createdAt),
                icon: RiTimeLine,
                color: stream.isLive ? "#fa5c5c" : "#828282",
              },
            ].map((stat) => (
              <div key={stat.label} className="supabase-panel p-3 sm:p-4 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <stat.icon className="size-3.5 shrink-0" style={{ color: stat.color }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                    {stat.label}
                  </span>
                </div>
                <p
                  className="text-xs sm:text-sm font-bold stat-value truncate"
                  style={{ color: stat.color }}
                  title={stat.value}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {stream.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stream.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="rounded text-[9px] font-mono px-2 py-0.5 bg-emerald-500/8 text-emerald-400/90 border border-emerald-500/15"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {!isEnded && (
            <StreamKeyPanel
              streamKey={activeKey}
              canRotate
              onRotate={handleRotateKey}
              rotating={rotating}
            />
          )}

          {!isEnded && streamId && (
            <StreamInvitePanel
              streamId={streamId}
              isPrivate={!!stream.isPrivate}
            />
          )}

          {isEnded && (
            <div className="callout-danger">
              <RiErrorWarningLine className="size-5 shrink-0 text-red-400 mt-0.5" />
              <div className="text-xs leading-relaxed min-w-0">
                <span className="font-bold block mb-0.5 text-red-400">Broadcast ended</span>
                <span className="text-muted-foreground">
                  Ingest keys for this session were revoked. OBS cannot push to this stream
                  anymore. Create a new broadcast to go live again.
                </span>
                <div className="mt-3">
                  <Button size="sm" asChild className="btn-primary-flat h-8 text-xs">
                    <Link href="/dashboard/streams/new">New Broadcast</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isReady && (
            <div className="callout-info">
              <RiCheckboxCircleLine className="size-5 shrink-0 text-emerald-400 mt-0.5" />
              <div className="text-xs leading-relaxed min-w-0">
                <span className="font-bold block mb-0.5 text-emerald-400">Session ready</span>
                <span className="text-muted-foreground">
                  Point OBS at the server URL and stream key above. Stopping OBS or using
                  End Broadcast both end this session and revoke the ingest key.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
