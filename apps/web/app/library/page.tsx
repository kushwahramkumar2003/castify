"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import {
  api,
  type LibraryLiveCard,
  type LibraryVodCard,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RiLiveLine,
  RiMovieLine,
  RiKey2Line,
  RiSearchLine,
  RiLoader4Line,
} from "react-icons/ri";
import { StreamCardMedia } from "@/components/viewer/stream-card-media";

type Tab = "live" | "vods" | "join";

function LibraryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "live";
  const codeFromUrl = searchParams.get("code") || "";
  const [tab, setTab] = useState<Tab>(
    ["live", "vods", "join"].includes(initialTab)
      ? initialTab
      : codeFromUrl
      ? "join"
      : "live"
  );
  const [q, setQ] = useState("");
  const [live, setLive] = useState<LibraryLiveCard[]>([]);
  const [vods, setVods] = useState<LibraryVodCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(codeFromUrl);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, v] = await Promise.all([
        api.libraryLive({ q: q || undefined }),
        api.libraryVods({ q: q || undefined }),
      ]);
      setLive(l.data ?? []);
      setVods(v.data ?? []);
    } catch (err: unknown) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      if (status === 401) {
        router.replace("/login?next=/library");
        return;
      }
      toast.error("Failed to load library");
    } finally {
      setLoading(false);
    }
  }, [q, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep-link: /library?tab=join&code=CAST-XXXX auto-fills and can redeem once
  useEffect(() => {
    if (codeFromUrl) {
      setTab("join");
      setCode(codeFromUrl.toUpperCase());
    }
  }, [codeFromUrl]);

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Enter an invite code");
      return;
    }
    setJoining(true);
    try {
      const res = await api.redeemInvite(code.trim());
      toast.success(
        res.data.alreadyHadAccess ? "You already have access" : "Access granted"
      );
      router.push(res.data.watchPath || `/watch/${res.data.streamId}`);
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Invalid invite code"
      );
    } finally {
      setJoining(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof RiLiveLine }[] = [
    { id: "live", label: "Live", icon: RiLiveLine },
    { id: "vods", label: "Recordings", icon: RiMovieLine },
    { id: "join", label: "Join code", icon: RiKey2Line },
  ];

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-8 space-y-5 animate-fade-up min-w-0">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Library</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Live streams and recordings you can watch — join private shows with a code.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex gap-1 p-1 rounded-md border border-border bg-[#141414] w-full sm:w-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[11px] font-semibold transition-colors ${
                tab === t.id
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "join" && (
          <div className="relative w-full sm:max-w-xs">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search…"
              className="pl-9 h-9 text-sm supabase-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}
      </div>

      {tab === "join" && (
        <div className="supabase-panel p-5 sm:p-6 max-w-md space-y-4">
          <div>
            <h2 className="text-sm font-bold">Join with invite code</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Creators share codes for private streams. You must be logged in.
            </p>
          </div>
          <form onSubmit={onJoin} className="space-y-3">
            <div className="space-y-1.5">
              <span className="section-label font-mono">Invite code</span>
              <Input
                placeholder="e.g. CAST-A1B2C3"
                className="h-11 font-mono text-sm supabase-input uppercase tracking-wide"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              disabled={joining}
              className="btn-primary-flat w-full h-10 gap-2 text-xs"
            >
              {joining ? (
                <RiLoader4Line className="size-4 spin" />
              ) : (
                <RiKey2Line className="size-4" />
              )}
              {joining ? "Redeeming…" : "Redeem & watch"}
            </Button>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Join links look like{" "}
              <code className="font-mono text-emerald-400/90">
                /library?tab=join&amp;code=…
              </code>{" "}
              and work on the same host you open Castify on (local or production).
            </p>
          </form>
        </div>
      )}

      {tab === "live" && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-xs text-muted-foreground animate-pulse py-12 text-center">
              Loading live sessions…
            </p>
          ) : live.length === 0 ? (
            <div className="supabase-panel empty-state py-12">
              <p className="text-sm font-bold">No live streams right now</p>
              <p className="text-xs text-muted-foreground mt-1">
                Check Explore or redeem a private invite code.
              </p>
              <Button size="sm" className="btn-secondary-flat h-8 text-xs mt-4" asChild>
                <Link href="/explore">Open Explore</Link>
              </Button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {live.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/watch/${s.id}`}
                    className="supabase-panel p-3 block hover:border-emerald-500/30 transition-colors space-y-2.5"
                  >
                    <StreamCardMedia
                      thumbnailUrl={s.thumbnailUrl}
                      isLive
                      title={s.title}
                    />
                    <div className="min-w-0 px-0.5">
                      <p className="text-sm font-semibold truncate">
                        {s.title || "Untitled"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        @{s.creator.username} · {s.currentViewers} watching
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "vods" && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-xs text-muted-foreground animate-pulse py-12 text-center">
              Loading recordings…
            </p>
          ) : vods.length === 0 ? (
            <div className="supabase-panel empty-state py-12">
              <p className="text-sm font-bold">No recordings yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ended streams with VODs appear here when you have access.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {vods.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/v/${v.id}`}
                    className="supabase-panel p-3 block hover:border-emerald-500/30 transition-colors space-y-2.5"
                  >
                    <StreamCardMedia
                      thumbnailUrl={v.thumbnailUrl}
                      title={v.title}
                    />
                    <div className="min-w-0 px-0.5">
                      <p className="text-sm font-semibold truncate">
                        {v.title || "Recording"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        @{v.creator.username}
                        {v.durationSecs != null
                          ? ` · ${Math.round(v.durationSecs / 60)}m`
                          : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="py-20 text-center text-xs text-muted-foreground">
            Loading library…
          </div>
        }
      >
        <LibraryInner />
      </Suspense>
    </RequireAuth>
  );
}
