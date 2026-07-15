"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { api, type UserCard } from "@/lib/api";
import {
  RiTeamLine,
  RiSearchLine,
  RiMailSendLine,
  RiUserFollowLine,
  RiUserLine,
  RiInformationLine,
} from "react-icons/ri";

export default function AudienceCRM() {
  const [search, setSearch] = useState("");
  const [followers, setFollowers] = useState<UserCard[]>([]);
  const [following, setFollowing] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getFollowers().catch(() => ({ data: [] as UserCard[] })),
      api.getFollowing().catch(() => ({ data: [] as UserCard[] })),
    ])
      .then(([f, g]) => {
        setFollowers(f.data ?? []);
        setFollowing(g.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return followers;
    return followers.filter(
      (v) =>
        v.username.toLowerCase().includes(q) ||
        (v.fullName ?? "").toLowerCase().includes(q)
    );
  }, [followers, search]);

  const statCards = [
    {
      label: "Followers",
      value: loading ? "…" : String(followers.length),
      icon: RiTeamLine,
      color: "#3ecf8e",
    },
    {
      label: "Following",
      value: loading ? "…" : String(following.length),
      icon: RiUserFollowLine,
      color: "#1998d5",
    },
    {
      label: "VIP / Subs",
      value: "—",
      icon: RiUserLine,
      color: "#e5b83b",
      sub: "Not ready",
    },
    {
      label: "Watch time CRM",
      value: "—",
      icon: RiMailSendLine,
      color: "#8a5cfa",
      sub: "Not ready",
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Audience"
        description="Real followers only — VIP tiers and campaigns ship later."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="supabase-panel p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3 min-w-0"
          >
            <div
              className="flex size-8 sm:size-9 items-center justify-center rounded-md shrink-0"
              style={{
                background: `${s.color}15`,
                border: `1px solid ${s.color}25`,
              }}
            >
              <s.icon className="size-4" style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p
                className="text-lg sm:text-xl font-bold stat-value truncate"
                style={{ color: s.color }}
              >
                {s.value}
              </p>
              <p className="text-[9px] sm:text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mt-0.5 truncate">
                {s.label}
              </p>
              {"sub" in s && s.sub && (
                <p className="text-[9px] text-muted-foreground/70 mt-0.5">{s.sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="callout-info flex gap-2.5 items-start">
        <RiInformationLine className="size-4 shrink-0 text-emerald-400 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Mock viewer CRM (VIP tiers, watch-time loyalty, email campaigns) was
          removed. This page lists people who{" "}
          <strong className="text-foreground/90">follow your channel</strong>.
          Broadcast announcements and segments are not wired yet.
        </p>
      </div>

      <div className="supabase-panel p-4 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="relative w-full sm:max-w-xs">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8a8a8a]" />
            <Input
              placeholder="Filter followers…"
              className="pl-9 h-9 text-sm bg-muted/20 supabase-input border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Badge className="rounded text-[10px] font-mono self-start sm:self-auto bg-emerald-500/8 text-emerald-400 border border-emerald-500/20">
            {loading ? "…" : `${followers.length} followers`}
          </Badge>
        </div>

        {loading ? (
          <p className="py-10 text-center text-xs text-muted-foreground animate-pulse">
            Loading followers…
          </p>
        ) : filtered.length === 0 ? (
          <div className="empty-state py-10">
            <p className="text-sm font-bold">
              {search ? "No matches" : "No followers yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {search
                ? "Try a different search."
                : "Share your watch link from Explore. When viewers follow you, they show up here."}
            </p>
          </div>
        ) : (
          <>
            <div className="sm:hidden space-y-2">
              {filtered.map((v) => (
                <Link
                  key={v.id}
                  href={`/u/${v.username}`}
                  className="block rounded-md border border-border/50 bg-[#1f1f1f]/20 p-3 hover:border-emerald-500/25 transition-colors"
                >
                  <p className="text-xs font-semibold truncate">
                    {v.fullName || v.username}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    @{v.username}
                  </p>
                </Link>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto -mx-1">
              <table className="w-full text-left text-xs border-collapse min-w-[360px]">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground/60">
                    <th className="py-2.5 px-1 font-semibold">Name</th>
                    <th className="py-2.5 px-1 font-semibold">Username</th>
                    <th className="py-2.5 px-1 font-semibold text-right">
                      Profile
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filtered.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-[#1f1f1f]/20 transition-colors"
                    >
                      <td className="py-3 px-1 font-semibold text-foreground/90 truncate max-w-[180px]">
                        {v.fullName || "—"}
                      </td>
                      <td className="py-3 px-1 font-mono text-muted-foreground">
                        @{v.username}
                      </td>
                      <td className="py-3 px-1 text-right">
                        <Link
                          href={`/u/${v.username}`}
                          className="text-emerald-400 hover:text-emerald-300 text-[11px] font-semibold"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
