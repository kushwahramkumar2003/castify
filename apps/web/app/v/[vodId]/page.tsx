"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { HlsViewerPlayer } from "@/components/viewer/hls-viewer-player";
import { api, type LibraryVodDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RiArrowLeftLine } from "react-icons/ri";

function VodInner() {
  const params = useParams();
  const vodId = params.vodId as string;
  const router = useRouter();
  const [data, setData] = useState<LibraryVodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vodId) return;
    setLoading(true);
    try {
      const res = await api.libraryVod(vodId);
      setData(res.data);
      setError(null);
    } catch (err: unknown) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to load recording";
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/v/${vodId}`)}`);
        return;
      }
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [vodId, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="supabase-panel empty-state">
        <p className="text-xs text-muted-foreground animate-pulse">
          Loading recording…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="supabase-panel empty-state space-y-3 max-w-lg mx-auto mt-8">
        <p className="text-sm font-bold">{error || "Not found"}</p>
        <p className="text-xs text-muted-foreground">
          Private recordings require a stream invite. Redeem a code in Library.
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="btn-secondary-flat h-8 text-xs" asChild>
            <Link href="/library?tab=join">Join with code</Link>
          </Button>
          <Button size="sm" className="btn-primary-flat h-8 text-xs" asChild>
            <Link href="/library?tab=vods">Back to Library</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { vod, creator, playback } = data;

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-up min-w-0 max-w-5xl mx-auto px-3 sm:px-4 py-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href="/library?tab=vods" aria-label="Back">
            <RiArrowLeftLine className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold truncate">
            {vod.title || "Recording"}
          </h1>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            @{creator.username} · VOD
          </p>
        </div>
      </div>

      <HlsViewerPlayer
        masterUrl={playback.masterUrl}
        qualityUrls={playback.qualityUrls}
        qualities={playback.qualities}
        isLive={false}
        title={vod.title ?? undefined}
      />
    </div>
  );
}

export default function VodWatchPage() {
  return (
    <RequireAuth>
      <VodInner />
    </RequireAuth>
  );
}
