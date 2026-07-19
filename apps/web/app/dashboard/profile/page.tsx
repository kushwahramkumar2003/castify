"use client";

import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { type UserCard } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiTeamLine,
  RiCalendarLine,
  RiVideoLine,
  RiMailLine,
  RiEditLine,
} from "react-icons/ri";
import Link from "next/link";

const GREEN = "#3ecf8e";
const BLUE = "#1998d5";

export default function ProfilePage() {
  const { user } = useAuth();
  const [followers, setFollowers] = useState<UserCard[]>([]);
  const [following, setFollowing] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamCount, setStreamCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.getFollowers(), api.getFollowing(), api.getStreams()])
      .then(([fr, fg, streams]) => {
        setFollowers(fr.data);
        setFollowing(fg.data);
        if (streams.data) setStreamCount(streams.data.length);
      })
      .catch(() => toast.error("Failed to load profile data"))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const initials = user.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user.username?.[0]?.toUpperCase() ?? "?");

  const joinedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      })
    : "—";

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Profile"
        description="How you appear to your audience."
        actions={
          <Button variant="secondary" size="sm" className="btn-secondary-flat gap-1.5" asChild>
            <Link href="/dashboard/settings">
              <RiEditLine className="size-3.5" />
              <span className="page-action-label">Edit</span>
            </Link>
          </Button>
        }
      />

      <div className="supabase-panel p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
          <div className="relative shrink-0">
            <Avatar className="size-14 sm:size-16 rounded-lg border border-border">
              {user.avatarUrl && (
                <AvatarImage src={user.avatarUrl} alt={user.username} referrerPolicy="no-referrer" />
              )}
              <AvatarFallback className="text-lg sm:text-xl font-bold rounded-lg bg-[#1a1a1a] text-emerald-400">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card"
              style={{ background: GREEN }}
              title="Online"
            />
          </div>

          <div className="flex-1 space-y-2.5 sm:space-y-3 min-w-0">
            <div className="space-y-0.5">
              <h3 className="text-lg sm:text-xl font-bold text-foreground/90 leading-tight truncate">
                {user.fullName ?? user.username}
              </h3>
              <p className="text-xs text-muted-foreground font-mono">@{user.username}</p>
            </div>

            {user.bio ? (
              <p className="text-xs sm:text-sm text-foreground/80 max-w-xl leading-relaxed">
                {user.bio}
              </p>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                No bio yet — add one in Settings.
              </p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-mono text-muted-foreground pt-0.5">
              <span className="flex items-center gap-1.5 min-w-0">
                <RiMailLine className="size-3.5 shrink-0" />
                <span className="truncate">{user.email}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <RiCalendarLine className="size-3.5 shrink-0" /> Joined {joinedDate}
              </span>
            </div>
          </div>
        </div>

        <Separator className="opacity-30" />

        <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
          {[
            {
              label: "Followers",
              value: loading ? "—" : String(followers.length),
              color: GREEN,
            },
            {
              label: "Following",
              value: loading ? "—" : String(following.length),
              color: BLUE,
            },
            {
              label: "Streams",
              value: loading ? "—" : String(streamCount),
              color: "#8a5cfa",
            },
          ].map((s) => (
            <div key={s.label} className="space-y-1 min-w-0">
              <p
                className="text-xl sm:text-2xl font-bold tracking-tight stat-value"
                style={{ color: s.color }}
              >
                {s.value}
              </p>
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground block truncate">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="supabase-panel p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 min-w-0">
              <RiTeamLine className="size-4 text-emerald-400 shrink-0" />
              <span className="truncate">Followers</span>
            </h3>
            <Badge
              variant="secondary"
              className="rounded font-mono text-[9px] px-2 bg-[#1f1f1f] shrink-0"
            >
              {followers.length}
            </Badge>
          </div>

          <div className="space-y-1.5 max-h-[220px] overflow-y-auto overscroll-contain pr-0.5">
            {loading ? (
              [1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-md bg-[#1a1a1a]" />)
            ) : followers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                No followers yet.
              </p>
            ) : (
              followers.map((u) => <UserRow key={u.id} user={u} />)
            )}
          </div>
        </div>

        <div className="supabase-panel p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 min-w-0">
              <RiVideoLine className="size-4 text-[#1998d5] shrink-0" />
              <span className="truncate">Following</span>
            </h3>
            <Badge
              variant="secondary"
              className="rounded font-mono text-[9px] px-2 bg-[#1f1f1f] shrink-0"
            >
              {following.length}
            </Badge>
          </div>

          <div className="space-y-1.5 max-h-[220px] overflow-y-auto overscroll-contain pr-0.5">
            {loading ? (
              [1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-md bg-[#1a1a1a]" />)
            ) : following.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Not following anyone yet.
              </p>
            ) : (
              following.map((u) => <UserRow key={u.id} user={u} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserRow({ user }: { user: UserCard }) {
  const initials = user.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user.username[0]?.toUpperCase() ?? "?");

  return (
    <div className="flex items-center gap-2.5 rounded-md p-2 bg-[#1f1f1f]/20 border border-transparent hover:border-border/30 transition-all min-w-0">
      <Avatar className="size-8 rounded-md border border-border/50 shrink-0">
        {user.avatarUrl && (
          <AvatarImage src={user.avatarUrl} alt={user.username} referrerPolicy="no-referrer" />
        )}
        <AvatarFallback className="text-[10px] font-bold rounded-md bg-[#1a1a1a] text-emerald-400">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate text-foreground/95">
          {user.fullName ?? user.username}
        </p>
        <p className="text-[10px] font-mono text-muted-foreground truncate">
          @{user.username}
        </p>
      </div>
    </div>
  );
}
