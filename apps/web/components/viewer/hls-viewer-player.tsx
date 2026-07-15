"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  RiPlayMiniFill,
  RiPauseMiniFill,
  RiVolumeUpLine,
  RiVolumeMuteLine,
  RiFullscreenLine,
  RiSettings3Line,
  RiRefreshLine,
  RiSignalTowerLine,
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
  levels: { height?: number; bitrate?: number }[];
  currentLevel: number;
};

export interface HlsViewerPlayerProps {
  /** ABR master playlist (preferred) */
  masterUrl: string | null;
  /** Per-quality direct playlists from stream creation settings */
  qualityUrls: Record<string, string>;
  /** Ordered quality labels e.g. ["720p","480p"] */
  qualities: string[];
  isLive: boolean;
  title?: string;
  /** Remount token when stream goes live again */
  reloadToken?: number | string;
}

function withCb(url: string, token: string | number) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_cb=${token}`;
}

/**
 * Feature-rich HLS viewer (hls.js):
 * - Auto / manual quality (ladder from stream creation)
 * - Live edge sync, mute, fullscreen, play/pause
 * - Storage/CDN proxy URLs only (no custom CORS-breaking headers)
 */
export function HlsViewerPlayer({
  masterUrl,
  qualityUrls,
  qualities,
  isLive,
  title,
  reloadToken = 0,
}: HlsViewerPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);

  const qualityOptions = useMemo(() => {
    const list = qualities?.length
      ? qualities
      : Object.keys(qualityUrls || {});
    return list.filter((q) => qualityUrls[q] || masterUrl);
  }, [qualities, qualityUrls, masterUrl]);

  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const activeUrl = useMemo(() => {
    if (selectedQuality !== "auto" && qualityUrls[selectedQuality]) {
      return qualityUrls[selectedQuality];
    }
    if (masterUrl) return masterUrl;
    // Fallback to highest listed quality
    const first = qualityOptions[0];
    return first ? qualityUrls[first] ?? null : null;
  }, [selectedQuality, qualityUrls, masterUrl, qualityOptions]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeUrl) {
      setConnecting(false);
      setError(isLive ? "Waiting for stream feed…" : "No playback available");
      return;
    }

    let cancelled = false;
    let ready = false;
    setConnecting(true);
    setError(null);

    const markReady = () => {
      if (cancelled || ready) return;
      ready = true;
      setConnecting(false);
      setError(null);
    };

    const timeout = window.setTimeout(() => {
      if (!cancelled && !ready) {
        setConnecting(false);
        setError(
          isLive
            ? "Still connecting — the creator may have just gone live. Try Refresh."
            : "Could not load this stream."
        );
      }
    }, 14_000);

    (async () => {
      const { default: Hls } = await import("hls.js");
      if (cancelled || !videoRef.current) return;

      hlsRef.current?.destroy();
      hlsRef.current = null;

      const src = withCb(activeUrl, `${reloadToken}-${selectedQuality}`);

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          liveDurationInfinity: isLive,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 12,
          maxBufferLength: 45,
          fragLoadingMaxRetry: 4,
          manifestLoadingMaxRetry: 5,
          levelLoadingMaxRetry: 5,
        }) as unknown as HlsInstance;

        hls.loadSource(src);
        hls.attachMedia(video);
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          markReady();
          if (isLive && typeof hls.liveSyncPosition === "number") {
            video.currentTime = Math.max(0, hls.liveSyncPosition - 0.5);
          }
          video
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        });

        hls.on(Hls.Events.FRAG_LOADED, () => markReady());

        hls.on(Hls.Events.ERROR, (...args: unknown[]) => {
          const data = args[1] as
            | { fatal?: boolean; type?: string; details?: string }
            | undefined;
          if (!data?.fatal) {
            if (
              data?.details === "fragLoadError" &&
              video.currentTime > 2
            ) {
              video.currentTime = Math.max(0, video.currentTime - 2);
            }
            return;
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try {
              hls.startLoad();
            } catch {
              /* ignore */
            }
            window.setTimeout(() => {
              if (!cancelled && !ready) {
                setConnecting(false);
                setError("Network error loading stream from storage.");
              }
            }, 5000);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              setConnecting(false);
              setError("Playback error — try another quality.");
            }
          } else {
            setConnecting(false);
            setError("Unable to play this stream.");
            hls.destroy();
            hlsRef.current = null;
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.addEventListener(
          "loadedmetadata",
          () => {
            markReady();
            video.play().catch(() => {});
          },
          { once: true }
        );
      } else {
        setConnecting(false);
        setError("HLS is not supported in this browser.");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [activeUrl, isLive, reloadToken, selectedQuality]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true));
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const toggleFs = () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else v.requestFullscreen();
  };

  const retry = () => {
    setError(null);
    setConnecting(true);
    // force effect by remounting source via quality toggle trick
    setSelectedQuality((q) => q);
    const hls = hlsRef.current;
    if (hls && activeUrl) {
      hls.loadSource(withCb(activeUrl, Date.now()));
      hls.startLoad();
    }
  };

  return (
    <div className="supabase-panel overflow-hidden bg-[#0a0a0a]">
      <div className="relative aspect-video bg-black group">
        <video
          ref={videoRef}
          playsInline
          controls={false}
          className="w-full h-full object-contain"
          onClick={togglePlay}
        />

        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 p-3 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <div className="min-w-0 pointer-events-auto">
            {title && (
              <p className="text-xs sm:text-sm font-semibold truncate text-white/95">
                {title}
              </p>
            )}
          </div>
          <span
            className={`pointer-events-none shrink-0 text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
              isLive
                ? "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse"
                : "bg-neutral-800/80 text-muted-foreground border-border"
            }`}
          >
            {isLive ? "● LIVE" : "● OFFLINE"}
          </span>
        </div>

        {/* Overlays */}
        {connecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-2">
            <RiSignalTowerLine className="size-7 text-emerald-400 animate-pulse" />
            <p className="text-xs font-semibold text-foreground/90">
              Connecting to stream…
            </p>
            <p className="text-[10px] text-muted-foreground">
              Loading HLS from storage
            </p>
          </div>
        )}

        {error && !connecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 p-4 text-center">
            <RiWifiOffLine className="size-7 text-amber-400" />
            <p className="text-xs font-semibold max-w-xs">{error}</p>
            <Button
              size="sm"
              className="btn-secondary-flat h-8 text-xs gap-1.5"
              onClick={retry}
            >
              <RiRefreshLine className="size-3.5" /> Retry
            </Button>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 inset-x-0 p-2.5 sm:p-3 flex items-center gap-2 bg-gradient-to-t from-black/90 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={togglePlay}
            className="p-1.5 text-white hover:text-emerald-400"
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
            className="p-1.5 text-white hover:text-emerald-400"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <RiVolumeMuteLine className="size-4" />
            ) : (
              <RiVolumeUpLine className="size-4" />
            )}
          </button>

          <div className="flex-1" />

          {/* Quality menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQualityMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-white/90 hover:bg-white/10 border border-white/10"
            >
              <RiSettings3Line className="size-3.5" />
              {selectedQuality === "auto" ? "Auto" : selectedQuality}
            </button>
            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-1.5 w-28 rounded-md border border-border bg-[#141414] shadow-xl p-1 z-20">
                <button
                  type="button"
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] ${
                    selectedQuality === "auto"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-foreground/80 hover:bg-[#1a1a1a]"
                  }`}
                  onClick={() => {
                    setSelectedQuality("auto");
                    setShowQualityMenu(false);
                  }}
                >
                  Auto (ABR)
                </button>
                {qualityOptions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`w-full text-left px-2 py-1.5 rounded text-[11px] ${
                      selectedQuality === q
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "text-foreground/80 hover:bg-[#1a1a1a]"
                    }`}
                    onClick={() => {
                      setSelectedQuality(q);
                      setShowQualityMenu(false);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleFs}
            className="p-1.5 text-white hover:text-emerald-400"
            aria-label="Fullscreen"
          >
            <RiFullscreenLine className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
