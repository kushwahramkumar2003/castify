"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  RiTvLine,
  RiShieldLine,
  RiFlashlightLine,
  RiArrowRightLine,
  RiCpuLine,
  RiGlobalLine,
  RiPlayCircleLine,
  RiServerLine,
  RiLockLine,
} from "react-icons/ri";

const CYAN = "#3ecf8e";

const features = [
  {
    icon: RiTvLine,
    title: "LL-HLS Streaming Engine",
    desc: "Sub-second broadcast latency. Keep your viewers perfectly synced without buffer hiccups.",
    accent: CYAN,
    glow: "rgba(62, 207, 142, 0.12)",
  },
  {
    icon: RiShieldLine,
    title: "AES-128 End-To-End Security",
    desc: "Raw video segments are fully encrypted on input. Nodes relay data without seeing it.",
    accent: "hsl(152 60% 50%)",
    glow: "rgba(62, 207, 142, 0.08)",
  },
  {
    icon: RiFlashlightLine,
    title: "Adaptive Transcoding Deck",
    desc: "Generate full quality ladders from 360p up to 2K dynamically based on client bitrates.",
    accent: "hsl(45 90% 55%)",
    glow: "rgba(229, 184, 59, 0.1)",
  },
  {
    icon: RiGlobalLine,
    title: "Decentralized Edge Relay",
    desc: "Deliver streams through community-hosted nodes. Scale to thousands of viewers without CDN bills.",
    accent: "hsl(200 80% 55%)",
    glow: "rgba(25, 152, 213, 0.1)",
  },
];

const pipeline = [
  { icon: RiPlayCircleLine, label: "OBS Ingest", sub: "RTMP push" },
  { icon: RiCpuLine, label: "Transcode", sub: "ABR ladder" },
  { icon: RiServerLine, label: "Package", sub: "HLS · MinIO" },
  { icon: RiLockLine, label: "Deliver", sub: "Edge relay" },
];

export default function Home() {
  const { user, isLoading } = useAuth();

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      {/* Background patterns */}
      <div className="pointer-events-none fixed inset-0 bg-dot-grid opacity-60" aria-hidden />
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[min(100%,720px)] h-[420px] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(62, 207, 142, 0.14) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      {/* Hero Section */}
      <section className="relative flex flex-col items-center text-center pt-10 sm:pt-16 md:pt-24 pb-12 sm:pb-16 md:pb-20 space-y-5 sm:space-y-7 md:space-y-8 px-1">
        {/* Project Badge */}
        <div
          className="animate-fade-up inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider select-none max-w-full"
          style={{
            background: "rgba(62, 207, 142, 0.08)",
            border: `1px solid rgba(62, 207, 142, 0.25)`,
            color: CYAN,
          }}
        >
          <span className="relative flex size-2 shrink-0">
            <span
              className="pulse-ring absolute inset-0 rounded-full"
              style={{ background: CYAN }}
            />
            <span className="relative size-2 rounded-full" style={{ background: CYAN }} />
          </span>
          <span className="truncate">Castify Studio 2.0</span>
        </div>

        {/* Heading */}
        <h1 className="animate-fade-up anim-delay-1 text-[2rem] leading-[1.1] xs:text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl px-1">
          Stream anything.
          <br />
          <span
            style={{
              background: `linear-gradient(135deg, ${CYAN} 0%, hsl(200 90% 52%) 60%, hsl(186 100% 70%) 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Own everything.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-up anim-delay-2 text-sm sm:text-base md:text-lg max-w-2xl leading-relaxed text-muted-foreground px-2">
          A self-hosted, high-fidelity encrypted live streaming platform. Package, transcode, and
          distribute video feeds via local community nodes with absolute control.
        </p>

        {/* Action Row */}
        <div className="animate-fade-up anim-delay-3 flex flex-col xs:flex-row flex-wrap justify-center items-stretch xs:items-center gap-2.5 sm:gap-3 pt-1 w-full max-w-md xs:max-w-none px-2">
          {!isLoading &&
            (user ? (
              <Button
                size="lg"
                className="btn-primary-flat h-11 sm:h-12 px-6 sm:px-8 text-sm gap-2 w-full xs:w-auto"
                asChild
              >
                <Link href="/explore">
                  Explore streams <RiArrowRightLine className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  className="btn-primary-flat h-11 sm:h-12 px-6 sm:px-8 text-sm gap-2 w-full xs:w-auto"
                  asChild
                >
                  <Link href="/signup">
                    Get Started Free <RiArrowRightLine className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="btn-secondary-flat h-11 sm:h-12 px-6 sm:px-8 text-sm gap-2 w-full xs:w-auto"
                  asChild
                >
                  <Link href="/login">Creator Login</Link>
                </Button>
              </>
            ))}
          {isLoading && (
            <div className="h-11 sm:h-12 w-full xs:w-40 rounded-md bg-white/5 animate-pulse" />
          )}
        </div>

        {/* Feature Tags */}
        <div className="animate-fade-up anim-delay-4 flex flex-wrap justify-center gap-x-4 sm:gap-x-8 gap-y-2 sm:gap-y-3 pt-3 sm:pt-5 text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground px-2">
          {["Full Encryption", "Zero CDN Bills", "OBS Studio Native", "Ultra-Low Latency"].map(
            (tag) => (
              <span key={tag} className="flex items-center gap-1.5 sm:gap-2">
                <span className="size-1.5 rounded-full shrink-0" style={{ background: CYAN }} />
                {tag}
              </span>
            )
          )}
        </div>
      </section>

      {/* Pipeline strip */}
      <section className="animate-fade-up anim-delay-4 pb-8 sm:pb-10">
        <div className="supabase-panel p-3 sm:p-4 overflow-x-auto">
          <div className="flex items-center justify-between gap-2 min-w-[280px] sm:min-w-0">
            {pipeline.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 mx-auto sm:mx-0">
                  <div
                    className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded border border-emerald-500/20 bg-emerald-500/8 text-emerald-400"
                  >
                    <step.icon className="size-3.5 sm:size-4" />
                  </div>
                  <div className="min-w-0 text-left hidden sm:block">
                    <p className="text-xs font-semibold text-foreground/90 truncate">{step.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{step.sub}</p>
                  </div>
                </div>
                {i < pipeline.length - 1 && (
                  <div className="hidden xs:block flex-1 h-px bg-gradient-to-r from-emerald-500/30 to-transparent min-w-[12px] max-w-[48px]" />
                )}
              </div>
            ))}
          </div>
          {/* Mobile labels under icons */}
          <div className="grid grid-cols-4 gap-1 mt-2 sm:hidden">
            {pipeline.map((step) => (
              <p
                key={step.label}
                className="text-[9px] font-medium text-muted-foreground text-center truncate px-0.5"
              >
                {step.label}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="animate-fade-up anim-delay-5 py-4 sm:py-6">
        <div className="supabase-panel p-5 sm:p-8 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-30 pointer-events-none" />

          {[
            { value: "<0.8s", label: "Relay Latency" },
            { value: "4K / 2K", label: "Supported Video" },
            { value: "Mesh", label: "Delivery Network" },
            { value: "100%", label: "Self-Hosted" },
          ].map((s) => (
            <div key={s.label} className="space-y-1 sm:space-y-1.5 relative z-10 min-w-0">
              <div
                className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight font-mono-data truncate"
                style={{ color: CYAN }}
              >
                {s.value}
              </div>
              <div className="text-[9px] sm:text-[11px] font-semibold tracking-wider text-muted-foreground uppercase leading-snug">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-12 sm:py-16 space-y-8 sm:space-y-12">
        <div className="text-center space-y-2 sm:space-y-3 px-1">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            Designed for Streaming Autonomy
          </h2>
          <p className="text-xs sm:text-sm md:text-base max-w-xl mx-auto text-muted-foreground leading-relaxed">
            Take back ownership of your stream feed, assets, transcripts, and audience metrics.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 md:gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="supabase-panel supabase-panel-interactive p-5 sm:p-7 space-y-4 sm:space-y-5 flex flex-col justify-between group"
            >
              <div className="space-y-3 sm:space-y-4">
                <div
                  className="inline-flex size-10 sm:size-12 items-center justify-center rounded transition-transform duration-300 group-hover:scale-105"
                  style={{
                    background: f.glow,
                    border: `1px solid ${f.accent}33`,
                  }}
                >
                  <f.icon className="size-4 sm:size-5" style={{ color: f.accent }} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base sm:text-lg text-foreground/90">{f.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Guest Invitation */}
      {!user && !isLoading && (
        <section className="py-10 sm:py-16">
          <div className="supabase-panel p-6 sm:p-10 text-center space-y-5 sm:space-y-6 relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 0%, rgba(62, 207, 142, 0.12) 0%, transparent 55%)",
              }}
            />
            <div className="relative z-10 space-y-3 sm:space-y-4">
              <div className="mx-auto flex size-12 sm:size-14 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <RiCpuLine className="size-6 sm:size-7 text-[#3ecf8e]" />
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight px-1">
                Ready to Reclaim Your Feed?
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed px-2">
                Configure your server node in minutes. Broadcast directly to your fans with no
                intermediaries.
              </p>
              <div className="pt-1 sm:pt-2 flex flex-col xs:flex-row justify-center gap-2.5 px-2">
                <Button
                  size="lg"
                  className="btn-primary-flat h-11 sm:h-12 px-6 sm:px-8 text-sm w-full xs:w-auto"
                  asChild
                >
                  <Link href="/signup">
                    Initialize Creator Studio{" "}
                    <RiArrowRightLine className="size-4 ml-1.5 inline-block" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Minimal footer */}
      <footer className="border-t border-border/40 pt-8 pb-10 sm:pb-12 mt-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <RiTvLine className="size-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground/80">castify</span>
          </div>
          <p className="text-[11px] text-muted-foreground max-w-xs sm:max-w-none leading-relaxed">
            Self-hosted live streaming · RTMP · HLS · Your infrastructure
          </p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
            <span className="text-border">·</span>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
