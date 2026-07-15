"use client";

import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiVideoAddLine,
  RiKeyLine,
  RiArrowRightLine,
  RiCheckLine,
} from "react-icons/ri";

const GREEN = "#3ecf8e";
const AMBER = "#e5b83b";
const RTMP_SERVER = "rtmp://localhost:1935/live";

export default function DashboardPage() {
  const { user } = useAuth();
  const [keyCount, setKeyCount] = useState<number | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [streamCount, setStreamCount] = useState(0);

  useEffect(() => {
    api
      .getStreamKeys()
      .then((r) => setKeyCount(r.data.length))
      .catch(() => setKeyCount(0));
    api
      .getStreams()
      .then((r) => {
        if (r.data) {
          setStreamCount(r.data.length);
          setLiveCount(r.data.filter((s) => s.isLive).length);
        }
      })
      .catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  // Prefer a real first name; skip ultra-short / initials-like tokens
  const rawFirst = user?.fullName?.trim().split(/\s+/)[0] ?? "";
  const firstName =
    rawFirst.length >= 3 ? rawFirst : (user?.username ?? "there");
  const hasKeys = (keyCount ?? 0) > 0;
  const hasStreams = streamCount > 0;
  const progressSteps = [hasKeys, hasStreams, liveCount > 0];
  const progressPct = Math.round(
    (progressSteps.filter(Boolean).length / progressSteps.length) * 100
  );

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Overview"
        description={`${greeting}, ${firstName}`}
        actions={
          <Button size="sm" asChild className="btn-primary-flat gap-1.5">
            <Link href="/dashboard/streams/new">
              <RiVideoAddLine className="size-3.5" />
              <span className="page-action-label">
                <span className="sm:hidden">New</span>
                <span className="hidden sm:inline">New broadcast</span>
              </span>
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="supabase-panel lg:col-span-2 p-4 sm:p-6 flex flex-col justify-between min-h-[220px] sm:min-h-[260px] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.04] to-transparent pointer-events-none" />
          <div className="space-y-3 sm:space-y-4 relative z-10">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="section-label font-mono">Broadcast Status</span>
              <span
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-wide border ${
                  liveCount > 0
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-neutral-800/40 text-muted-foreground border-border"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    liveCount > 0 ? "bg-red-400 animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                {liveCount > 0 ? `${liveCount} LIVE` : "OFFLINE"}
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-bold tracking-tight">
                Active Transcoder Nodes
              </h3>
              <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
                Connect OBS Studio, vMix, or Streamlabs with an RTMP key. The pipeline packages
                HLS and serves viewers when you go live.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-4 border-t border-border/40 mt-5 sm:mt-6 relative z-10">
            <div className="min-w-0">
              <span className="text-xl sm:text-2xl font-bold stat-value text-emerald-400">
                {liveCount}
              </span>
              <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground mt-1">
                Live Now
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-xl sm:text-2xl font-bold stat-value text-[#1998d5]">
                {streamCount}
              </span>
              <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground mt-1">
                Sessions
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-xl sm:text-2xl font-bold stat-value text-foreground">
                {keyCount === null ? "—" : keyCount}
              </span>
              <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground mt-1">
                Keys
              </p>
            </div>
          </div>
        </div>

        <div className="supabase-panel p-4 sm:p-6 flex flex-col justify-between min-h-[220px] sm:min-h-[260px]">
          <div className="space-y-3 sm:space-y-4">
            <span className="section-label font-mono">Stream Target</span>
            <div className="space-y-2">
              <h3 className="text-sm font-bold tracking-tight">Media Source Configuration</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Use these values in your encoder settings. Keep the stream key private.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <div className="rounded-md p-3 bg-[#121212] border border-border">
              <span className="section-label font-mono block mb-1.5">Server Destination</span>
              <code className="text-[11px] font-mono text-foreground/80 break-all select-all block">
                {RTMP_SERVER}
              </code>
            </div>
            <Button asChild className="w-full btn-primary-flat text-xs gap-1.5 h-9">
              <Link href="/dashboard/stream-keys">
                <RiKeyLine className="size-3.5" /> Manage Ingest Keys{" "}
                <RiArrowRightLine className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="supabase-panel p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-bold tracking-tight">Node Setup Checklist</h3>
            <p className="text-xs text-muted-foreground">
              Complete these steps to go live with OBS.
            </p>
          </div>

          <div className="space-y-1.5">
            {[
              {
                step: "01",
                title: "Initialize Stream Key",
                detail: "Generate a secure RTMP validation token.",
                href: "/dashboard/stream-keys",
                done: hasKeys,
              },
              {
                step: "02",
                title: "Create Broadcast Session",
                detail: "Open Stream Center and configure a new ingest setup.",
                href: "/dashboard/streams/new",
                done: hasStreams,
              },
              {
                step: "03",
                title: "Launch Live Stream",
                detail: "Start streaming in OBS — Studio shows LIVE when active.",
                href: "/dashboard/streams",
                done: liveCount > 0,
              },
            ].map((item) => (
              <Link
                href={item.href}
                key={item.step}
                className="group flex items-start gap-3 rounded-md p-2.5 sm:p-3 border border-transparent transition-all duration-150 hover:bg-[#1f1f1f]/40 hover:border-border/40"
              >
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded text-[10px] font-mono font-semibold mt-0.5 border ${
                    item.done
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                      : "bg-muted/30 text-muted-foreground border-border"
                  }`}
                >
                  {item.done ? <RiCheckLine className="size-3.5" /> : item.step}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold group-hover:text-emerald-400 transition-colors">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Setup progress</span>
              <span className="font-mono tabular-nums">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-1 bg-[#1f1f1f]" />
          </div>
        </div>

        <div className="supabase-panel p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-bold tracking-tight">Active Edge Transcoders</h3>
            <p className="text-xs text-muted-foreground">
              Health status of ingest, packaging, and delivery nodes.
            </p>
          </div>

          <div className="space-y-2 sm:space-y-2.5">
            {[
              {
                label: "RTMP Edge Ingest",
                status: "Online",
                desc: "Port 1935 active",
                color: GREEN,
              },
              {
                label: "HLS Packager",
                status: "Operational",
                desc: "MinIO segment upload",
                color: GREEN,
              },
              {
                label: "Transcoder Engine",
                status: "Online",
                desc: "720p · 480p · 360p ladder",
                color: GREEN,
              },
              {
                label: "Live Delivery",
                status: liveCount > 0 ? "Active" : "Idle",
                desc: liveCount > 0 ? "Serving viewers" : "No stream inputs",
                color: liveCount > 0 ? GREEN : AMBER,
              },
            ].map((node) => (
              <div
                key={node.label}
                className="flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-md bg-[#1f1f1f]/25 border border-border/40"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-foreground/90 truncate">{node.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{node.desc}</p>
                </div>
                <span
                  className="flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-wide shrink-0"
                  style={{ color: node.color }}
                >
                  <span
                    className="size-1.5 rounded-full inline-block"
                    style={{ background: node.color }}
                  />
                  {node.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
