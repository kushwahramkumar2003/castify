"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  RiTvLine,
  RiPlayCircleLine,
  RiUserHeartLine,
  RiArrowRightLine,
  RiLiveLine,
  RiShieldUserLine,
  RiHdLine,
  RiShareLine,
} from "react-icons/ri";

const GREEN = "#3ecf8e";

const features = [
  {
    icon: RiLiveLine,
    title: "Watch live, anywhere",
    desc: "Discover live creators and jump into the stream in one tap. Adaptive quality keeps playback smooth on any connection.",
  },
  {
    icon: RiPlayCircleLine,
    title: "Catch up later",
    desc: "Missed it live? Open recordings from your Library and pick up where you left off.",
  },
  {
    icon: RiShareLine,
    title: "Join with a code",
    desc: "Private shows use invite codes or links. Redeem once and you’re in — no tech setup for viewers.",
  },
  {
    icon: RiHdLine,
    title: "Broadcast when you’re ready",
    desc: "Creators get a simple Studio to go live, share invites, and manage quality — only when you need it.",
  },
];

export default function Home() {
  const { user, isLoading } = useAuth();

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="pointer-events-none fixed inset-0 bg-dot-grid opacity-60" aria-hidden />
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[min(100%,720px)] h-[420px] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(62, 207, 142, 0.14) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <section className="relative flex flex-col items-center text-center pt-10 sm:pt-16 md:pt-24 pb-12 sm:pb-16 space-y-5 sm:space-y-7 px-1">
        <div
          className="animate-fade-up inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider"
          style={{
            background: "rgba(62, 207, 142, 0.08)",
            border: `1px solid rgba(62, 207, 142, 0.25)`,
            color: GREEN,
          }}
        >
          <span className="relative flex size-2 shrink-0">
            <span className="pulse-ring absolute inset-0 rounded-full" style={{ background: GREEN }} />
            <span className="relative size-2 rounded-full" style={{ background: GREEN }} />
          </span>
          Live community streaming
        </div>

        <h1 className="animate-fade-up anim-delay-1 text-[2rem] leading-[1.1] xs:text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight max-w-3xl px-1">
          Watch creators you love.
          <br />
          <span
            style={{
              background: `linear-gradient(135deg, ${GREEN} 0%, hsl(200 90% 52%) 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Or start your own show.
          </span>
        </h1>

        <p className="animate-fade-up anim-delay-2 text-sm sm:text-base md:text-lg max-w-xl leading-relaxed text-muted-foreground px-2">
          Castify is a place to follow live streams, join private sessions with a code, and
          go live when you have something to share — all in one clean account.
        </p>

        <div className="animate-fade-up anim-delay-3 flex flex-col xs:flex-row flex-wrap justify-center gap-2.5 sm:gap-3 pt-1 w-full max-w-md xs:max-w-none px-2">
          {!isLoading &&
            (user ? (
              <>
                <Button size="lg" className="btn-primary-flat h-11 sm:h-12 px-6 text-sm gap-2" asChild>
                  <Link href="/explore">
                    Explore live <RiArrowRightLine className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="btn-secondary-flat h-11 sm:h-12 px-6 text-sm gap-2"
                  asChild
                >
                  <Link href="/library">My Library</Link>
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" className="btn-primary-flat h-11 sm:h-12 px-6 text-sm gap-2" asChild>
                  <Link href="/signup">
                    Create free account <RiArrowRightLine className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="btn-secondary-flat h-11 sm:h-12 px-6 text-sm gap-2"
                  asChild
                >
                  <Link href="/login">Sign in</Link>
                </Button>
              </>
            ))}
          {isLoading && (
            <div className="h-11 sm:h-12 w-full xs:w-40 rounded-md bg-white/5 animate-pulse" />
          )}
        </div>

        <div className="animate-fade-up anim-delay-4 flex flex-wrap justify-center gap-x-5 gap-y-2 pt-3 text-[10px] sm:text-xs font-medium text-muted-foreground">
          {["Free to watch", "Invite codes for private shows", "Go live in minutes"].map(
            (tag) => (
              <span key={tag} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full shrink-0" style={{ background: GREEN }} />
                {tag}
              </span>
            )
          )}
        </div>
      </section>

      <section className="pb-10 sm:pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            {
              icon: RiPlayCircleLine,
              title: "For viewers",
              desc: "Browse live shows, follow creators, and redeem invites.",
              href: user ? "/explore" : "/signup",
              cta: "Start watching",
            },
            {
              icon: RiUserHeartLine,
              title: "Your library",
              desc: "Recordings and streams you unlocked, all in one place.",
              href: user ? "/library" : "/login?next=/library",
              cta: "Open library",
            },
            {
              icon: RiTvLine,
              title: "For creators",
              desc: "When you’re ready to broadcast, open Studio from your menu.",
              href: user ? "/dashboard/streams/new" : "/signup",
              cta: "Go live",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="supabase-panel p-5 sm:p-6 flex flex-col gap-3 text-left"
            >
              <div className="flex size-10 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                <card.icon className="size-5" />
              </div>
              <h3 className="text-sm font-bold">{card.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                {card.desc}
              </p>
              <Button size="sm" className="btn-secondary-flat h-8 text-xs w-fit" asChild>
                <Link href={card.href}>
                  {card.cta} <RiArrowRightLine className="size-3.5" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10 sm:py-14 space-y-8">
        <div className="text-center space-y-2 px-1">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Built around people, not infrastructure
          </h2>
          <p className="text-xs sm:text-sm max-w-lg mx-auto text-muted-foreground">
            No ports, pipelines, or ops dashboards in your face — just watch, join, and create.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
          {features.map((f) => (
            <div key={f.title} className="supabase-panel p-5 sm:p-6 space-y-3">
              <div className="inline-flex size-10 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <f.icon className="size-4" />
              </div>
              <h3 className="font-bold text-base text-foreground/90">{f.title}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-16">
        <div className="supabase-panel p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <RiShieldUserLine className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Your account, your privacy</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
                Sign in once to watch and follow. Creator tools stay tucked away until you need
                them.
              </p>
            </div>
          </div>
          {!user && (
            <Button size="sm" className="btn-primary-flat h-9 text-xs shrink-0" asChild>
              <Link href="/signup">Join Castify</Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
