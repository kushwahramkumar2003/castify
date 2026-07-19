"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeBanner } from "@/components/billing/upgrade-banner";
import { PlanBadge } from "@/components/billing/plan-badge";
import { useAuth } from "@/lib/auth";
import { api, type Stream } from "@/lib/api";
import {
  RiLineChartLine,
  RiEyeLine,
  RiTeamLine,
  RiTimeLine,
  RiFlashlightLine,
  RiInformationLine,
} from "react-icons/ri";

const CYAN = "#3ecf8e";
const GREEN = "#3ecf8e";

function formatHours(seconds: number): string {
  if (seconds <= 0) return "0h";
  const h = seconds / 3600;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const isPremium =
    user?.plan === "PRO" ||
    user?.plan === "ENTERPRISE" ||
    user?.entitlements?.advancedAnalytics;

  useEffect(() => {
    api
      .getStreams()
      .then((r) => setStreams(r.data ?? []))
      .catch(() => setStreams([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const totalViews = streams.reduce((n, s) => n + (s.totalViews ?? 0), 0);
    const peakViewers = streams.reduce(
      (n, s) => Math.max(n, s.peakViewers ?? 0),
      0
    );
    const liveNow = streams
      .filter((s) => !s.endedAt)
      .reduce((n, s) => n + (s.currentViewers ?? 0), 0);
    const hoursStreamed = streams.reduce(
      (n, s) => n + (s.durationSecs ?? 0),
      0
    );
    const endedWithViews = streams.filter(
      (s) => (s.totalViews ?? 0) > 0 || (s.peakViewers ?? 0) > 0
    );
    const avgPeak =
      endedWithViews.length > 0
        ? Math.round(
            endedWithViews.reduce((n, s) => n + (s.peakViewers ?? 0), 0) /
              endedWithViews.length
          )
        : 0;

    return {
      totalViews,
      peakViewers,
      liveNow,
      hoursStreamed,
      avgPeak,
      sessionCount: streams.length,
    };
  }, [streams]);

  const statCards = [
    {
      label: "Total Views",
      value: loading ? "…" : String(stats.totalViews),
      sub: "Unique watch sessions",
      icon: RiEyeLine,
      color: CYAN,
    },
    {
      label: "Peak Viewers",
      value: loading ? "…" : String(stats.peakViewers),
      sub: "Best concurrent",
      icon: RiLineChartLine,
      color: GREEN,
    },
    {
      label: "Watching now",
      value: loading ? "…" : String(stats.liveNow),
      sub: "Across open sessions",
      icon: RiTeamLine,
      color: "#1998d5",
    },
    {
      label: "Hours Streamed",
      value: loading ? "…" : formatHours(stats.hoursStreamed),
      sub: "Recorded duration",
      icon: RiTimeLine,
      color: "#e5b83b",
    },
    {
      label: "Avg peak / stream",
      value: loading ? "…" : String(stats.avgPeak),
      sub: `${stats.sessionCount} sessions`,
      icon: RiFlashlightLine,
      color: "#8a5cfa",
    },
  ];

  const topSessions = useMemo(() => {
    return [...streams]
      .sort(
        (a, b) =>
          (b.totalViews ?? 0) - (a.totalViews ?? 0) ||
          (b.peakViewers ?? 0) - (a.peakViewers ?? 0)
      )
      .slice(0, 8);
  }, [streams]);

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Analytics"
        description={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>Real numbers from your broadcasts — no demo charts.</span>
            <PlanBadge plan={user?.plan} size="xs" />
          </span>
        }
        actions={
          <Badge className="gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded border bg-emerald-500/8 text-emerald-400 border-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span className="page-action-label">From your streams</span>
          </Badge>
        }
      />

      {!isPremium && (
        <UpgradeBanner
          plan={user?.plan}
          compact
          message="Basic totals are free. Pro unlocks deeper retention insights and priority analytics as we expand this page."
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="supabase-panel p-3.5 sm:p-5 space-y-2.5 sm:space-y-3 min-w-0"
          >
            <div
              className="flex size-8 items-center justify-center rounded-md"
              style={{
                background: `${s.color}15`,
                border: `1px solid ${s.color}25`,
              }}
            >
              <s.icon className="size-4" style={{ color: s.color }} />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div
                className="text-xl sm:text-2xl font-bold tracking-tight stat-value truncate"
                style={{ color: s.color }}
              >
                {s.value}
              </div>
              <p className="text-[11px] sm:text-xs font-semibold text-foreground/80 leading-none truncate">
                {s.label}
              </p>
              <p className="text-[10px] text-muted-foreground leading-none mt-1">
                {s.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="callout-info flex gap-2.5 items-start">
        <RiInformationLine className="size-4 shrink-0 text-emerald-400 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground/90">How counting works:</strong>{" "}
          <em>Watching now</em> is concurrent viewers on{" "}
          <code className="font-mono text-[10px]">/watch</code> (heartbeat every
          10s). <em>Total views</em> increments once per viewer session.{" "}
          <em>Peak</em> is the highest concurrent count during a session.
          Historical charts and follower growth will land when the analytics
          service ships — until then we only show numbers we can compute from
          your stream records.
        </p>
      </div>

      <div className="supabase-panel p-4 sm:p-6 space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold tracking-tight">Sessions by views</h3>
          <p className="text-xs text-muted-foreground">
            Top broadcasts ranked by total views, then peak concurrent
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground animate-pulse py-8 text-center">
            Loading…
          </p>
        ) : topSessions.length === 0 ? (
          <div className="empty-state py-10">
            <p className="text-sm font-bold">No sessions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a broadcast and share the watch link to start collecting
              real viewer stats.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {topSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 min-w-0"
              >
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold truncate">
                    {s.title || "Untitled"}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground truncate">
                    {s.isLive ? "LIVE" : s.endedAt ? "ENDED" : "READY"} ·{" "}
                    {s.id}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-[11px] font-mono">
                  <span className="text-muted-foreground" title="Watching now">
                    <span className="text-emerald-400 font-semibold">
                      {s.currentViewers ?? 0}
                    </span>{" "}
                    now
                  </span>
                  <span className="text-muted-foreground" title="Peak">
                    <span className="text-foreground/90 font-semibold">
                      {s.peakViewers ?? 0}
                    </span>{" "}
                    peak
                  </span>
                  <span className="text-muted-foreground" title="Total views">
                    <span className="text-foreground/90 font-semibold">
                      {s.totalViews ?? 0}
                    </span>{" "}
                    views
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
