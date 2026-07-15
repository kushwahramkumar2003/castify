"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  RiPlayMiniFill,
  RiPauseMiniFill,
  RiVolumeUpLine,
  RiVolumeMuteLine,
  RiFullscreenLine,
  RiPulseLine,
  RiDashboardLine,
  RiFlashlightLine,
  RiSettings3Line,
  RiRefreshLine,
  RiSignalTowerLine,
  RiMovieLine,
  RiLinkUnlinkM,
  RiWifiOffLine,
} from "react-icons/ri";

type HlsInstance = {
  destroy: () => void;
  loadSource: (url: string) => void;
  attachMedia: (el: HTMLMediaElement) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  startLoad: (startPosition?: number) => void;
  recoverMediaError: () => void;
  liveSyncPosition: number | null | undefined;
  bandwidthEstimate?: number;
};

export type PlayerMode = "live" | "vod" | "offline";

interface StreamPlayerMonitorProps {
  mode: PlayerMode;
  streamKey?: string | null;
  vodUrl?: string | null;
  title?: string;
  onRefresh?: () => void;
  /** True while OBS is actively publishing to this session */
  isLive?: boolean;
  /** Bumps on each false→true live transition so HLS remounts */
  liveEpoch?: number;
}

function getLiveStreamUrl(key: string) {
  const configUrl = process.env.NEXT_PUBLIC_HLS_BASE_URL;
  if (configUrl) {
    const base = configUrl.replace(/\/$/, "");
    return `${base}/${key}/master.m3u8`;
  }
  return `http://localhost:8080/minio/hls-segments/live/${key}/master.m3u8`;
}

function getVodPlayUrl(playlistUrl: string) {
  if (playlistUrl.startsWith("http")) return playlistUrl;
  if (
    playlistUrl.startsWith("hls-segments/") ||
    playlistUrl.startsWith("vod-archive/")
  ) {
    return `http://localhost:8080/minio/${playlistUrl}`;
  }
  return `http://localhost:8080/minio/vod-archive/${playlistUrl}`;
}

/** Bust browser/proxy cache on every playlist request (master + quality). */
function withCacheBust(url: string, token: number | string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_cb=${token}`;
}

export function StreamPlayerMonitor({
  mode,
  streamKey = null,
  vodUrl = null,
  title,
  onRefresh,
  isLive = false,
  liveEpoch = 0,
}: StreamPlayerMonitorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [resolution, setResolution] = useState("720p");
  const [isConnecting, setIsConnecting] = useState(false);
  const [ingestDown, setIngestDown] = useState(mode === "live" && !isLive);
  const [hasEverHadMedia, setHasEverHadMedia] = useState(false);

  /** Real HLS estimate (kbps) when hls.js reports bandwidth; null = unknown */
  const [bitrateKbps, setBitrateKbps] = useState<number | null>(null);
  /** Estimated edge distance from video clock vs liveSyncPosition */
  const [latency, setLatency] = useState<number | null>(null);
  /** Seconds of media buffered ahead of playhead */
  const [bufferSize, setBufferSize] = useState<number | null>(null);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);

  const basePlaybackUrl =
    mode === "live" && streamKey
      ? getLiveStreamUrl(streamKey)
      : mode === "vod" && vodUrl
      ? getVodPlayUrl(vodUrl)
      : null;

  // Session state for creator studio
  // - live + isLive: active OBS push
  // - live + !isLive: session open, OBS disconnected (paused)
  // - offline: permanently ended
  // - vod: archived playback
  const isPausedSession = mode === "live" && !isLive && !!streamKey;
  const isActiveLive = mode === "live" && isLive;

  useEffect(() => {
    if (mode === "offline") {
      setIngestDown(true);
      setIsConnecting(false);
      return;
    }
    if (mode === "vod") {
      setIngestDown(false);
      return;
    }
    if (mode === "live") {
      setIngestDown(!isLive);
    }
  }, [mode, isLive]);

  // Load / remount HLS whenever URL, mode, live flag, or reconnect epoch changes
  useEffect(() => {
    const video = videoRef.current;
    if (!basePlaybackUrl || !video) return;

    if (mode === "offline") {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setIsConnecting(false);
      return;
    }

    // Paused: still load EVENT playlist for review; Live: autoplay at edge
    const playAsLive = isActiveLive;
    const cacheToken = `${liveEpoch}-${isLive ? "L" : "P"}-${Date.now()}`;
    const sourceUrl = withCacheBust(basePlaybackUrl, cacheToken);

    let cancelled = false;
    let readyOnce = false;
    setIsConnecting(true);

    const markReady = () => {
      if (cancelled || readyOnce) return;
      readyOnce = true;
      setIsConnecting(false);
      setHasEverHadMedia(true);
      setIngestDown(!playAsLive);
    };

    const onReady = () => {
      markReady();
      if (playAsLive) {
        const hls = hlsRef.current;
        // Prefer live edge; if that fails (missing last frag), fall back slightly earlier
        const trySeekLive = () => {
          const livePos = hls?.liveSyncPosition;
          if (typeof livePos === "number" && Number.isFinite(livePos) && livePos > 0) {
            video.currentTime = Math.max(0, livePos - 0.5);
          } else if (Number.isFinite(video.duration) && video.duration > 2) {
            video.currentTime = Math.max(0, video.duration - 2);
          }
        };
        trySeekLive();
        video
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      } else {
        video.pause();
        setIsPlaying(false);
      }
    };

    // Never leave the UI spinning forever
    const connectTimeout = window.setTimeout(() => {
      if (!cancelled && !readyOnce) {
        setIsConnecting(false);
        if (playAsLive) setIngestDown(true);
      }
    }, 12_000);

    (async () => {
      const { default: Hls } = await import("hls.js");
      if (cancelled || !videoRef.current) return;

      hlsRef.current?.destroy();
      hlsRef.current = null;

      if (Hls.isSupported()) {
        // Storage/CDN proxy only — no custom request headers (avoids CORS preflight)
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false, // more stable with EVENT multi-clip playlists
          liveDurationInfinity: playAsLive,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          maxLiveSyncPlaybackRate: 1.2,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 1000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 1000,
          fragLoadingMaxRetry: 3,
          fragLoadingRetryDelay: 500,
        }) as unknown as HlsInstance;

        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, onReady);
        hls.on(Hls.Events.FRAG_LOADED, () => {
          // First successful fragment = really playing
          markReady();
        });

        hls.on(Hls.Events.ERROR, (...args: unknown[]) => {
          const data = args[1] as
            | {
                fatal?: boolean;
                type?: string;
                details?: string;
                frag?: { sn?: number };
              }
            | undefined;
          if (!data) return;

          // Missing last segment at live edge: step back and keep going
          if (
            !data.fatal &&
            (data.details === "fragLoadError" ||
              data.details === "fragLoadTimeOut")
          ) {
            if (video.currentTime > 2) {
              video.currentTime = Math.max(0, video.currentTime - 2);
            }
            return;
          }

          if (!data.fatal) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // One recovery attempt, then surface paused/error UI (not infinite spin)
            try {
              hls.startLoad();
            } catch {
              /* ignore */
            }
            window.setTimeout(() => {
              if (!cancelled && !readyOnce) {
                setIsConnecting(false);
                setIngestDown(true);
              }
            }, 4000);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              setIsConnecting(false);
              setIngestDown(true);
            }
          } else {
            hls.destroy();
            hlsRef.current = null;
            setIsConnecting(false);
            setIngestDown(true);
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = sourceUrl;
        video.addEventListener("loadedmetadata", onReady, { once: true });
      } else {
        setIsConnecting(false);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimeout);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [basePlaybackUrl, mode, isLive, liveEpoch, isActiveLive]);

  // Real player telemetry only — no simulated bitrate/FPS
  useEffect(() => {
    if (!isActiveLive || ingestDown) {
      setBitrateKbps(null);
      setLatency(null);
      setBufferSize(null);
      return;
    }

    const tick = () => {
      const video = videoRef.current;
      if (!video) return;

      // Buffered ahead
      try {
        const { buffered, currentTime } = video;
        if (buffered.length > 0) {
          const end = buffered.end(buffered.length - 1);
          setBufferSize(Math.max(0, parseFloat((end - currentTime).toFixed(2))));
        } else {
          setBufferSize(null);
        }
      } catch {
        setBufferSize(null);
      }

      setVideoHeight(video.videoHeight || 0);

      // Dropped frames when browser exposes it
      const q = video as HTMLVideoElement & {
        getVideoPlaybackQuality?: () => { droppedVideoFrames?: number };
        webkitDroppedFrameCount?: number;
      };
      if (typeof q.getVideoPlaybackQuality === "function") {
        setDroppedFrames(q.getVideoPlaybackQuality().droppedVideoFrames ?? 0);
      } else if (typeof q.webkitDroppedFrameCount === "number") {
        setDroppedFrames(q.webkitDroppedFrameCount);
      }

      const hls = hlsRef.current;
      if (hls) {
        const bw = hls.bandwidthEstimate;
        if (typeof bw === "number" && Number.isFinite(bw) && bw > 0) {
          setBitrateKbps(Math.round(bw / 1000));
        }
        const livePos = hls.liveSyncPosition;
        if (
          typeof livePos === "number" &&
          Number.isFinite(livePos) &&
          Number.isFinite(video.currentTime)
        ) {
          setLatency(
            Math.max(0, parseFloat((livePos - video.currentTime).toFixed(2)))
          );
        } else {
          setLatency(null);
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isActiveLive, ingestDown]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true));
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else videoRef.current.requestFullscreen();
  };

  const forceRefresh = () => {
    onRefresh?.();
    // Force remount by destroying; parent liveEpoch/onRefresh should re-fetch stream
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setIsConnecting(true);
  };

  const statusLabel =
    mode === "vod"
      ? "RECORDING"
      : mode === "offline"
      ? "ENDED"
      : isActiveLive && !ingestDown
      ? "LIVE"
      : isPausedSession
      ? "PAUSED"
      : isConnecting
      ? "CONNECTING"
      : "WAITING";

  // After media existed + OBS stop → clear "paused / disconnected" message
  const showPausedOverlay = isPausedSession && hasEverHadMedia && !isConnecting;
  // First-time READY before any OBS connect
  const showFirstWaitOverlay = isPausedSession && !hasEverHadMedia && !isConnecting;
  // Only while we are actively resolving the first playlist/fragment
  const showConnectingOverlay = isActiveLive && isConnecting;
  const showEndedOverlay = mode === "offline";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5 min-w-0">
      <div className="lg:col-span-2 flex flex-col justify-between supabase-panel p-3 sm:p-4 min-h-[300px] sm:min-h-[380px] relative overflow-hidden bg-[#0a0a0a]">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/40 mb-3 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-wide border transition-colors shrink-0 ${
                mode === "vod"
                  ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                  : statusLabel === "LIVE"
                  ? "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
                  : statusLabel === "PAUSED"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                  : "bg-neutral-800/20 text-[#828282] border-[#828282]/20"
              }`}
            >
              ● {statusLabel}
            </span>
            {title && (
              <span className="text-[10px] font-mono text-muted-foreground truncate hidden xs:inline">
                {title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {mode === "live" && (
              <>
                <button
                  type="button"
                  onClick={forceRefresh}
                  disabled={isConnecting || !streamKey}
                  title="Refresh stream status"
                  aria-label="Refresh stream status"
                  className="p-1.5 rounded-md hover:bg-[#1b1b1b] text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                >
                  <RiRefreshLine
                    className={`size-3.5 ${isConnecting ? "animate-spin" : ""}`}
                  />
                </button>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  disabled={statusLabel !== "LIVE"}
                  aria-label="Quality"
                  className="bg-[#141414] border border-border rounded-md px-1.5 py-1 text-[9px] font-mono text-muted-foreground focus:outline-none focus:border-emerald-500 disabled:opacity-50 max-w-[100px] sm:max-w-none"
                >
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </select>
              </>
            )}
          </div>
        </div>

        <div className="relative flex-1 rounded-md overflow-hidden bg-black flex items-center justify-center group select-none min-h-[180px] sm:min-h-[220px]">
          <video
            ref={videoRef}
            playsInline
            muted={isMuted}
            controls={mode === "vod" || isPausedSession}
            className={`w-full h-full object-contain sm:object-cover max-h-[240px] sm:max-h-[300px] transition-opacity duration-300 ${
              showPausedOverlay ||
              showFirstWaitOverlay ||
              showConnectingOverlay ||
              showEndedOverlay
                ? "opacity-40"
                : "opacity-100"
            }`}
            onClick={isActiveLive ? togglePlay : undefined}
          />

          {/* OBS disconnected / session still open (after at least one live push) */}
          {showPausedOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 sm:p-6 bg-black/75 space-y-3 sm:space-y-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <RiLinkUnlinkM className="size-6" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-sm font-bold tracking-tight text-foreground">
                  Stream paused — OBS disconnected
                </h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Ingest stopped. This session is still open. Start streaming again in OBS
                  with the same stream key — new clips will append to this playlist.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={forceRefresh}
                  className="btn-secondary-flat h-8 px-3 text-[10px] gap-1.5"
                >
                  <RiRefreshLine className="size-3.5" />
                  Check status
                </Button>
              </div>
            </div>
          )}

          {/* First-time READY before any OBS connect */}
          {showFirstWaitOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 sm:p-6 bg-black/90 space-y-3">
              <div className="size-11 sm:size-12 rounded-md bg-neutral-800/10 border border-border flex items-center justify-center text-muted-foreground">
                <RiSignalTowerLine className="size-5 sm:size-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold tracking-tight text-foreground/90">
                  Waiting for OBS
                </h4>
                <p className="text-[10px] text-muted-foreground max-w-xs leading-relaxed">
                  Point OBS at the server URL and stream key below, then Start Streaming.
                </p>
              </div>
            </div>
          )}

          {/* Connecting after go-live / reconnect */}
          {showConnectingOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 sm:p-6 bg-black/80 space-y-3">
              <div className="size-11 sm:size-12 rounded-md bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <RiSignalTowerLine className="size-5 sm:size-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold tracking-tight text-foreground/90">
                  Connecting to live feed…
                </h4>
                <p className="text-[10px] text-muted-foreground max-w-xs leading-relaxed">
                  Transcoder is packaging new segments. This usually takes a few seconds.
                </p>
              </div>
            </div>
          )}

          {showEndedOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 sm:p-6 bg-black/90 space-y-3">
              <RiMovieLine className="size-8 text-muted-foreground/50" />
              <h4 className="text-xs font-bold text-foreground/90">Broadcast ended</h4>
              <p className="text-[10px] text-muted-foreground max-w-xs leading-relaxed">
                This session is permanently closed. Open Recordings if a VOD was created.
              </p>
            </div>
          )}

          {isActiveLive && !ingestDown && (
            <>
              <div className="absolute top-2.5 right-2.5 pointer-events-none flex flex-col items-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                {videoHeight > 0 && (
                  <span className="bg-black/75 px-2 py-0.5 rounded text-[9px] font-mono border border-white/5 text-foreground/80">
                    {videoHeight}p
                  </span>
                )}
                <span className="bg-black/75 px-2 py-0.5 rounded text-[9px] font-mono border border-white/5 text-foreground/80">
                  Buf: {bufferSize != null ? `${bufferSize}s` : "—"}
                </span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-11 bg-gradient-to-t from-black/95 to-transparent flex items-center justify-between px-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="text-white hover:text-emerald-400 transition-colors p-1"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? (
                      <RiPauseMiniFill className="size-5" />
                    ) : (
                      <RiPlayMiniFill className="size-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="text-white hover:text-emerald-400 transition-colors p-1"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <RiVolumeMuteLine className="size-4" />
                    ) : (
                      <RiVolumeUpLine className="size-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="text-white hover:text-emerald-400 transition-colors p-1"
                  aria-label="Fullscreen"
                >
                  <RiFullscreenLine className="size-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="supabase-panel p-4 sm:p-5 flex flex-col justify-between min-w-0">
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3">
            <RiPulseLine className="size-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
              {mode === "vod" ? "Recording Playback" : "Ingest status"}
            </h3>
          </div>

          {mode === "live" && (
            <div
              className={`rounded-md border p-3 text-[11px] leading-relaxed ${
                isActiveLive && !ingestDown
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400/90"
                  : isPausedSession
                  ? "border-amber-500/25 bg-amber-500/5 text-amber-400/90"
                  : "border-border bg-muted/20 text-muted-foreground"
              }`}
            >
              {isActiveLive && !ingestDown ? (
                <p className="flex items-start gap-2">
                  <RiSignalTowerLine className="size-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-semibold">Live.</strong> OBS is publishing.
                    New segments are appending to this session.
                  </span>
                </p>
              ) : isPausedSession ? (
                <p className="flex items-start gap-2">
                  <RiWifiOffLine className="size-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-semibold">Disconnected.</strong> Stop streaming
                    in OBS only — session stays open. Restart OBS with the same key to add
                    more clips.
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-2">
                  <RiSignalTowerLine className="size-3.5 shrink-0 mt-0.5" />
                  <span>Waiting for the first OBS connection…</span>
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed">
            {mode === "vod"
              ? "Archived HLS segments from this broadcast session."
              : "Player metrics from your studio preview (HLS buffer & estimate). OBS input bitrate/FPS are not reported to Castify yet."}
          </p>

          {mode === "live" && (
            <div className="space-y-2 pt-0.5">
              {[
                {
                  label: "Live edge lag",
                  value:
                    isActiveLive && !ingestDown && latency != null
                      ? `${latency}s`
                      : "—",
                  sub:
                    isActiveLive && !ingestDown
                      ? "Player vs playlist edge"
                      : isPausedSession
                      ? "Ingest stopped"
                      : "Awaiting input",
                  icon: RiFlashlightLine,
                  color:
                    isActiveLive && !ingestDown
                      ? "#3ecf8e"
                      : isPausedSession
                      ? "#e5b83b"
                      : "#828282",
                },
                {
                  label: "Download est.",
                  value:
                    isActiveLive && !ingestDown && bitrateKbps != null
                      ? bitrateKbps >= 1000
                        ? `${(bitrateKbps / 1000).toFixed(2)} Mbps`
                        : `${bitrateKbps} kbps`
                      : "—",
                  sub:
                    isActiveLive && !ingestDown
                      ? "hls.js bandwidth estimate"
                      : isPausedSession
                      ? "Ingest stopped"
                      : "Awaiting input",
                  icon: RiDashboardLine,
                  color:
                    isActiveLive && !ingestDown
                      ? "#1998d5"
                      : isPausedSession
                      ? "#e5b83b"
                      : "#828282",
                },
                {
                  label: "Buffer / dropped",
                  value:
                    isActiveLive && !ingestDown
                      ? `${bufferSize != null ? `${bufferSize}s` : "—"} · ${droppedFrames} drop`
                      : "—",
                  sub:
                    isActiveLive && !ingestDown
                      ? videoHeight
                        ? `Decode ${videoHeight}p`
                        : "From HTML video"
                      : isPausedSession
                      ? "Ingest stopped"
                      : "Awaiting input",
                  icon: RiSettings3Line,
                  color:
                    isActiveLive && !ingestDown
                      ? "#8a5cfa"
                      : isPausedSession
                      ? "#e5b83b"
                      : "#828282",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-[#1b1b1b]/30 border border-border"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="flex size-7 items-center justify-center rounded-md shrink-0 border"
                      style={{
                        background: `${stat.color}12`,
                        borderColor: `${stat.color}20`,
                      }}
                    >
                      <stat.icon className="size-3.5" style={{ color: stat.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground leading-none truncate">
                        {stat.label}
                      </p>
                      <p className="text-[9px] text-muted-foreground/60 leading-none mt-1 font-mono truncate">
                        {stat.sub}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs font-extrabold stat-value shrink-0"
                    style={{ color: stat.color }}
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {mode === "live" && (
          <div className="pt-4 border-t border-border/40 mt-4 grid grid-cols-2 gap-2 sm:gap-3 text-center">
            <div className="bg-[#1b1b1b]/10 rounded-md border border-border p-2">
              <span className="text-sm font-bold stat-value text-foreground/80">
                {isActiveLive && !ingestDown ? droppedFrames : "—"}
              </span>
              <span className="block text-[8px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">
                Dropped Frames
              </span>
            </div>
            <div className="bg-[#1b1b1b]/10 rounded-md border border-border p-2">
              <span className="text-sm font-bold stat-value text-emerald-400">
                {isActiveLive && !ingestDown && videoHeight > 0
                  ? `${videoHeight}p`
                  : "—"}
              </span>
              <span className="block text-[8px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">
                Decode height
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
