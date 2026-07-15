"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, Vod } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiMovieLine,
  RiDownloadLine,
  RiPlayLine,
  RiTimeLine,
  RiHardDriveLine,
  RiSearchLine,
  RiDeleteBinLine,
  RiCloseLine,
  RiVideoLine,
} from "react-icons/ri";

const GREEN = "#3ecf8e";
const BLUE = "#1998d5";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const getVodPlayUrl = (playlistUrl: string | null) => {
  if (!playlistUrl) return "";
  if (playlistUrl.startsWith("http")) return playlistUrl;
  if (
    playlistUrl.startsWith("hls-segments/") ||
    playlistUrl.startsWith("vod-archive/")
  ) {
    return `http://localhost:8080/minio/${playlistUrl}`;
  }
  return `http://localhost:8080/minio/vod-archive/${playlistUrl}`;
};

export default function RecordingsPage() {
  const [search, setSearch] = useState("");
  const [vods, setVods] = useState<Vod[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeVodUrl, setActiveVodUrl] = useState<string | null>(null);
  const [activeVodTitle, setActiveVodTitle] = useState("");
  const modalVideoRef = useRef<HTMLVideoElement>(null);

  const fetchVods = () => {
    api
      .getVods()
      .then((res) => {
        if (res.data) setVods(res.data);
      })
      .catch((err) => console.error("Failed to load VODs", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchVods();
  }, []);

  useEffect(() => {
    if (!activeVodUrl || !modalVideoRef.current) return;
    let hls: Hls | undefined;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(activeVodUrl);
      hls.attachMedia(modalVideoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        modalVideoRef.current?.play().catch(() => {});
      });
    } else if (modalVideoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      modalVideoRef.current.src = activeVodUrl;
    }
    return () => {
      hls?.destroy();
    };
  }, [activeVodUrl]);

  // Escape closes modal
  useEffect(() => {
    if (!activeVodUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveVodUrl(null);
        setActiveVodTitle("");
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [activeVodUrl]);

  const filtered = vods.filter((r) =>
    (r.title || "Untitled Capture").toLowerCase().includes(search.toLowerCase())
  );

  const deleteRecording = (id: string) => {
    if (!confirm("Delete this broadcast recording capture permanently?")) return;
    setVods((prev) => prev.filter((item) => item.id !== id));
  };

  const totalDurationSecs = vods.reduce((acc, curr) => acc + (curr.durationSecs || 0), 0);
  const totalStorageGb = parseFloat(((totalDurationSecs / 3600) * 1.6).toFixed(2));

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Recordings"
        description="Replays from ended broadcasts."
      />

      <div className="grid grid-cols-1 xs:grid-cols-3 gap-2.5 sm:gap-4">
        {[
          { label: "Total Captures", value: String(vods.length), icon: RiMovieLine, color: GREEN },
          {
            label: "Storage",
            value: `${totalStorageGb} GB`,
            icon: RiHardDriveLine,
            color: BLUE,
          },
          {
            label: "Duration",
            value: formatDuration(totalDurationSecs),
            icon: RiTimeLine,
            color: "#8a5cfa",
          },
        ].map((s) => (
          <div key={s.label} className="supabase-panel p-3.5 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0">
            <div
              className="flex size-9 sm:size-10 items-center justify-center rounded shrink-0 border"
              style={{
                background: `${s.color}12`,
                borderColor: `${s.color}20`,
              }}
            >
              <s.icon className="size-4 sm:size-5" style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-bold stat-value truncate" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="text-[9px] sm:text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mt-0.5 truncate">
                {s.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="relative w-full sm:max-w-xs">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8a8a8a]" />
          <Input
            placeholder="Search recordings…"
            className="pl-9 h-9 text-sm bg-muted/20 supabase-input border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="supabase-panel empty-state">
            <p className="text-xs text-muted-foreground animate-pulse">Syncing VOD archives…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="supabase-panel empty-state">
            <div className="flex size-12 items-center justify-center rounded-md mb-3 bg-muted/20 border border-border">
              <RiMovieLine className="size-5 opacity-40" />
            </div>
            <p className="text-sm font-bold">No captures found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {search
                ? "No recordings match your search."
                : "Recordings appear here after you End Broadcast from the studio."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((r) => {
              const fileUrl = getVodPlayUrl(r.playlistUrl);
              const fileSize = `${(((r.durationSecs || 0) / 3600) * 1.6).toFixed(1)} GB`;

              return (
                <div
                  key={r.id}
                  className="supabase-panel p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/8 border border-emerald-500/20 text-emerald-400">
                      <RiMovieLine className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold truncate text-foreground/90">
                        {r.title || "Untitled Capture"}
                      </p>
                      <div className="flex items-center gap-x-2 sm:gap-x-3 gap-y-1 mt-1 text-[10px] sm:text-xs text-muted-foreground flex-wrap font-mono">
                        <span>{formatDate(r.createdAt)}</span>
                        <span className="opacity-40">·</span>
                        <span>{formatDuration(r.durationSecs)}</span>
                        <span className="opacity-40">·</span>
                        <span>{fileSize}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setActiveVodUrl(fileUrl);
                        setActiveVodTitle(r.title || "VOD Playback");
                      }}
                      className="btn-secondary-flat gap-1.5 text-xs h-9 px-3 flex-1 sm:flex-initial"
                    >
                      <RiPlayLine className="size-4" /> Play
                    </Button>

                    {fileUrl && (
                      <a
                        href={fileUrl}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 text-xs h-9 px-3 font-medium rounded-md border border-border bg-[#1b1b1b]/50 hover:bg-[#262626] transition-colors flex-1 sm:flex-initial"
                      >
                        <RiDownloadLine className="size-4" />
                        <span className="hidden xs:inline">Download</span>
                      </a>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteRecording(r.id)}
                      title="Delete capture"
                      aria-label="Delete recording"
                    >
                      <RiDeleteBinLine className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeVodUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveVodUrl(null);
              setActiveVodTitle("");
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="VOD player"
        >
          <div className="supabase-panel max-w-3xl w-full bg-[#0a0a0a] border border-border p-3 sm:p-4 relative flex flex-col rounded-t-xl sm:rounded-lg max-h-[92dvh] safe-pb">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/40 mb-3 sm:mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <RiVideoLine className="size-4 text-emerald-400 shrink-0" />
                <h3 className="text-xs font-bold truncate">{activeVodTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveVodUrl(null);
                  setActiveVodTitle("");
                }}
                className="p-2 rounded-md hover:bg-[#1a1a1a] text-muted-foreground hover:text-foreground transition-all shrink-0"
                aria-label="Close player"
              >
                <RiCloseLine className="size-5" />
              </button>
            </div>

            <div className="relative rounded-md overflow-hidden bg-black flex items-center justify-center max-h-[min(400px,55dvh)]">
              <video
                ref={modalVideoRef}
                controls
                playsInline
                className="w-full h-full object-contain max-h-[min(380px,50dvh)]"
              />
            </div>

            <div className="mt-3 text-[10px] text-muted-foreground font-mono flex items-center justify-between gap-2 flex-wrap">
              <span>Codec: AVC1 / AAC</span>
              <span className="truncate">Source: HLS segments</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
