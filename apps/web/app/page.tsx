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
  RiHeart3Line,
  RiSparkling2Line,
  RiGroupLine,
} from "react-icons/ri";

const GREEN = "#3ecf8e";

const features = [
  {
    icon: RiLiveLine,
    title: "Watch live, anytime",
    desc: "Find creators who are live right now and join in a tap. Playback adjusts so it stays smooth on your phone or laptop.",
  },
  {
    icon: RiPlayCircleLine,
    title: "Never miss a moment",
    desc: "Couldn’t make it live? Open your Library later and rewatch full sessions whenever you want.",
  },
  {
    icon: RiShareLine,
    title: "Private shows, simple invites",
    desc: "Friends-only streams use a short code or link. Redeem once — you’re in. No apps to install as a viewer.",
  },
  {
    icon: RiHdLine,
    title: "Go live when inspiration hits",
    desc: "Share a game night, a class, or a talk with people who care. Start a stream in minutes and invite who you want.",
  },
];

const steps = [
  {
    n: "01",
    title: "Create a free account",
    desc: "One profile for watching, following, and (when you’re ready) going live.",
  },
  {
    n: "02",
    title: "Explore or join with a code",
    desc: "Browse public lives, or enter an invite code for private sessions.",
  },
  {
    n: "03",
    title: "Follow & rewatch",
    desc: "Keep creators close and catch recordings from your Library.",
  },
];

export default function Home() {
  const { user, isLoading } = useAuth();

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div
        className="pointer-events-none fixed inset-0 bg-dot-grid opacity-50"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[min(100%,820px)] h-[480px] rounded-full blur-3xl opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(62, 207, 142, 0.16) 0%, rgba(25, 152, 213, 0.06) 45%, transparent 70%)",
        }}
        aria-hidden
      />

      {/* Hero */}
      <section className="relative flex flex-col items-center text-center pt-10 sm:pt-16 md:pt-22 pb-12 sm:pb-16 space-y-5 sm:space-y-7 px-1">
        <div
          className="animate-fade-up inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider"
          style={{
            background: "rgba(62, 207, 142, 0.08)",
            border: `1px solid rgba(62, 207, 142, 0.25)`,
            color: GREEN,
          }}
        >
          <span className="relative flex size-2 shrink-0">
            <span
              className="pulse-ring absolute inset-0 rounded-full"
              style={{ background: GREEN }}
            />
            <span
              className="relative size-2 rounded-full"
              style={{ background: GREEN }}
            />
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
          Castify is where people gather for live shows — hang out with
          creators, join private sessions with friends, and share your own
          stream when you have something worth showing.
        </p>

        <div className="animate-fade-up anim-delay-3 flex flex-col xs:flex-row flex-wrap justify-center gap-2.5 sm:gap-3 pt-1 w-full max-w-md xs:max-w-none px-2">
          {!isLoading &&
            (user ? (
              <>
                <Button
                  size="lg"
                  className="btn-primary-flat h-11 sm:h-12 px-6 text-sm gap-2"
                  asChild
                >
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
                <Button
                  size="lg"
                  className="btn-primary-flat h-11 sm:h-12 px-6 text-sm gap-2"
                  asChild
                >
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
          {[
            "Free to watch",
            "Private invites for friends",
            "Go live in minutes",
          ].map((tag) => (
            <span key={tag} className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ background: GREEN }}
              />
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* Audience paths */}
      <section className="pb-10 sm:pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            {
              icon: RiPlayCircleLine,
              title: "For viewers",
              desc: "Browse who’s live, follow your favorites, and join private shows with a code.",
              href: user ? "/explore" : "/signup",
              cta: "Start watching",
            },
            {
              icon: RiUserHeartLine,
              title: "Your library",
              desc: "Streams and recordings you’ve unlocked — saved in one calm place.",
              href: user ? "/library" : "/login?next=/library",
              cta: "Open library",
            },
            {
              icon: RiTvLine,
              title: "For creators",
              desc: "Ready to share? Start a stream, invite your audience, and go live when you are.",
              href: user ? "/dashboard/streams/new" : "/signup",
              cta: "Start creating",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="supabase-panel p-5 sm:p-6 flex flex-col gap-3 text-left hover:border-emerald-500/20 transition-colors"
            >
              <div className="flex size-10 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                <card.icon className="size-5" />
              </div>
              <h3 className="text-sm font-bold">{card.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                {card.desc}
              </p>
              <Button
                size="sm"
                className="btn-secondary-flat h-8 text-xs w-fit"
                asChild
              >
                <Link href={card.href}>
                  {card.cta} <RiArrowRightLine className="size-3.5" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Why people use Castify */}
      <section className="py-10 sm:py-14 space-y-8">
        <div className="text-center space-y-2 px-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/90">
            Why Castify
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Made for watching together
          </h2>
          <p className="text-xs sm:text-sm max-w-lg mx-auto text-muted-foreground leading-relaxed">
            Whether you’re dropping into a live room or hosting for a small
            circle, everything stays simple — no clutter, no jargon.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="supabase-panel p-5 sm:p-6 space-y-3 hover:border-white/10 transition-colors"
            >
              <div className="inline-flex size-10 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <f.icon className="size-4" />
              </div>
              <h3 className="font-bold text-base text-foreground/90">
                {f.title}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-6 sm:py-10 pb-12 sm:pb-16">
        <div className="text-center space-y-2 px-1 mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Three steps to the fun
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
            From first visit to your next favorite live — without the learning
            curve.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="supabase-panel p-5 sm:p-6 text-left space-y-3 relative overflow-hidden"
            >
              <span
                className="text-3xl font-black tabular-nums opacity-[0.12] absolute top-3 right-4 select-none"
                style={{ color: GREEN }}
              >
                {s.n}
              </span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                Step {s.n}
              </p>
              <h3 className="text-sm font-bold pr-10">{s.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof strip */}
      <section className="pb-10 sm:pb-12">
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
          {[
            {
              icon: RiHeart3Line,
              label: "For fans",
              value: "Follow & rewatch",
            },
            {
              icon: RiGroupLine,
              label: "For friends",
              value: "Private invite rooms",
            },
            {
              icon: RiSparkling2Line,
              label: "For creators",
              value: "Go live your way",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="supabase-panel px-4 py-4 flex items-center gap-3"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <s.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {s.label}
                </p>
                <p className="text-xs font-bold text-foreground/90 truncate">
                  {s.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy CTA */}
      <section className="pb-16">
        <div className="supabase-panel p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-emerald-500/15">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <RiShieldUserLine className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">One account. Your privacy.</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
                Sign in once to watch and follow. Creator tools stay out of the
                way until you choose to use them.
              </p>
            </div>
          </div>
          {!user && (
            <Button
              size="sm"
              className="btn-primary-flat h-9 text-xs shrink-0 gap-1.5"
              asChild
            >
              <Link href="/signup">
                Join free <RiArrowRightLine className="size-3.5" />
              </Link>
            </Button>
          )}
          {user && (
            <Button
              size="sm"
              className="btn-primary-flat h-9 text-xs shrink-0 gap-1.5"
              asChild
            >
              <Link href="/explore">
                Explore live <RiArrowRightLine className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
