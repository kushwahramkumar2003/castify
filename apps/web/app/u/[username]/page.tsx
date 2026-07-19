"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { api, type BrowseStreamCard, type PublicProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  RiUserAddLine,
  RiUserUnfollowLine,
  RiLoader4Line,
  RiVideoLine,
  RiArrowLeftLine,
} from "react-icons/ri";

function ProfileInner() {
  const params = useParams();
  const username = params.username as string;
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [streams, setStreams] = useState<BrowseStreamCard[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      const [p, status, browse] = await Promise.all([
        api.getPublicProfile(username),
        api.followStatus(username).catch(() => ({
          data: { isFollowing: false, isSelf: user?.username === username },
        })),
        api.browseStreams({ q: username }),
      ]);
      setProfile(p.data);
      setIsFollowing(status.data.isFollowing);
      setIsSelf(status.data.isSelf || user?.username === username);
      setStreams(
        (browse.data ?? []).filter(
          (s) => s.creator.username.toLowerCase() === username.toLowerCase()
        )
      );
    } catch (err: unknown) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/u/${username}`)}`);
        return;
      }
      toast.error(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  }, [username, user?.username, router]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!profile) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await api.unfollow(profile.username);
        setIsFollowing(false);
        setProfile((p) =>
          p ? { ...p, followerCount: Math.max(0, p.followerCount - 1) } : p
        );
        toast.success(`Unfollowed @${profile.username}`);
      } else {
        await api.follow(profile.username);
        setIsFollowing(true);
        setProfile((p) =>
          p ? { ...p, followerCount: p.followerCount + 1 } : p
        );
        toast.success(`Following @${profile.username}`);
      }
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Action failed"
      );
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="supabase-panel empty-state">
        <p className="text-xs text-muted-foreground animate-pulse">
          Loading profile…
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="supabase-panel empty-state space-y-2">
        <p className="text-sm font-bold">Creator not found</p>
        <Button size="sm" className="btn-secondary-flat h-8 text-xs" asChild>
          <Link href="/explore">Explore streams</Link>
        </Button>
      </div>
    );
  }

  const initials = profile.fullName
    ? profile.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : profile.username[0]?.toUpperCase() ?? "?";

  return (
    <div className="space-y-5 animate-fade-up min-w-0 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 -ml-2" asChild>
        <Link href="/explore">
          <RiArrowLeftLine className="size-3.5" /> Explore
        </Link>
      </Button>

      <div className="supabase-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          <Avatar className="size-16 rounded-lg border border-border shrink-0">
            {profile.avatarUrl && (
              <AvatarImage src={profile.avatarUrl} alt={profile.username} referrerPolicy="no-referrer" />
            )}
            <AvatarFallback className="rounded-lg text-lg font-bold bg-[#1a1a1a] text-emerald-400">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {profile.fullName || profile.username}
            </h1>
            <p className="text-xs font-mono text-muted-foreground">
              @{profile.username}
            </p>
            {profile.bio && (
              <p className="text-sm text-muted-foreground leading-relaxed pt-1">
                {profile.bio}
              </p>
            )}
            <p className="text-[11px] font-mono text-muted-foreground pt-1">
              {profile.followerCount} followers · {profile.followingCount}{" "}
              following
            </p>
          </div>
          {!isSelf && (
            <Button
              size="sm"
              disabled={followBusy}
              onClick={toggleFollow}
              className={`h-9 text-xs gap-1.5 shrink-0 ${
                isFollowing ? "btn-secondary-flat" : "btn-primary-flat"
              }`}
            >
              {followBusy ? (
                <RiLoader4Line className="size-3.5 spin" />
              ) : isFollowing ? (
                <RiUserUnfollowLine className="size-3.5" />
              ) : (
                <RiUserAddLine className="size-3.5" />
              )}
              {isFollowing ? "Unfollow" : "Follow"}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="section-label">Public sessions</h2>
        {streams.length === 0 ? (
          <div className="supabase-panel empty-state py-10">
            <RiVideoLine className="size-6 opacity-40 mb-2" />
            <p className="text-xs text-muted-foreground">
              No public sessions right now.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {streams.map((s) => (
              <Link
                key={s.id}
                href={`/watch/${s.id}`}
                className="supabase-panel p-3.5 flex items-center justify-between gap-3 hover:bg-[#1a1a1a]/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {s.title || "Untitled"}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {(s.qualities || []).join(" · ") || "Live"}
                  </p>
                </div>
                <Badge
                  className={`shrink-0 text-[9px] font-bold ${
                    s.isLive
                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  }`}
                >
                  {s.isLive ? "LIVE" : "READY"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreatorProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}
