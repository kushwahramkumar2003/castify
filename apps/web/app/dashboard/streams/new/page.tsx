"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiTvLine,
  RiArrowLeftLine,
  RiLockLine,
  RiGlobalLine,
  RiCheckboxCircleLine,
  RiClipboardLine,
  RiCheckLine,
  RiInformationLine,
  RiEyeLine,
  RiEyeOffLine,
  RiSettings3Line,
  RiBroadcastLine,
  RiLoader4Line,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiTimeLine,
} from "react-icons/ri";
import { toast } from "sonner";

const RTMP_SERVER = "rtmp://localhost:1935/live";
const PRIMARY = "#3ecf8e";

const QUALITIES = [
  { key: "1080p", label: "1080p", detail: "Source · ~6 Mbps", rec: false },
  { key: "720p", label: "720p", detail: "High · ~3 Mbps", rec: true },
  { key: "480p", label: "480p", detail: "Medium · ~1.5 Mbps", rec: true },
  { key: "360p", label: "360p", detail: "Low · ~0.8 Mbps", rec: false },
] as const;

export default function NewStreamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [selectedQualities, setSelectedQualities] = useState<string[]>(["720p", "480p"]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdStreamId, setCreatedStreamId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);

  const step: 1 | 2 = createdKey ? 2 : 1;

  const toggleQuality = (q: string) => {
    setSelectedQualities((prev) => {
      if (prev.includes(q)) {
        if (prev.length === 1) {
          toast.error("Keep at least one quality ladder rung");
          return prev;
        }
        return prev.filter((item) => item !== q);
      }
      return [...prev, q];
    });
  };

  const copyToClipboard = useCallback(async (text: string, type: "key" | "url") => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      if (type === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
      toast.success(type === "key" ? "Stream key copied" : "Server URL copied");
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  }, []);

  const validate = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Give your broadcast a title");
      return false;
    }
    if (trimmed.length > 120) {
      setTitleError("Title must be 120 characters or fewer");
      return false;
    }
    if (selectedQualities.length === 0) {
      toast.error("Select at least one transcoding quality");
      return false;
    }
    if (scheduleType === "later") {
      if (!scheduledAt) {
        toast.error("Pick a schedule date and time");
        return false;
      }
      if (new Date(scheduledAt).getTime() < Date.now()) {
        toast.error("Schedule time must be in the future");
        return false;
      }
    }
    setTitleError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 12);

    try {
      const res = await api.createStream({
        title: title.trim() || "Untitled Live Stream",
        tags,
        qualities: selectedQualities,
        isPrivate,
        scheduledAt: scheduleType === "later" && scheduledAt ? scheduledAt : null,
      });
      if (res.data) {
        setCreatedKey(res.data.streamKey.key);
        setCreatedStreamId(res.data.stream.id);
        toast.success("Broadcast setup ready");
      } else {
        toast.error("Unexpected response — try again");
      }
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to create broadcast"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up w-full max-w-5xl">
      <PageHeader
        leading={
          <Button variant="ghost" size="icon" asChild aria-label="Back to streams">
            <Link href="/dashboard/streams">
              <RiArrowLeftLine className="size-4" />
            </Link>
          </Button>
        }
        title="New broadcast"
        description="Title, quality, and OBS credentials."
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2 sm:gap-3" role="list" aria-label="Setup progress">
        {[
          { n: 1 as const, label: "Configure", icon: RiSettings3Line },
          { n: 2 as const, label: "Credentials", icon: RiBroadcastLine },
        ].map((s, i) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <div key={s.n} className="flex items-center gap-2 sm:gap-3 min-w-0" role="listitem">
              {i > 0 && (
                <div
                  className={`h-px w-6 sm:w-10 shrink-0 transition-colors ${
                    done || active ? "bg-emerald-500/50" : "bg-border"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 border text-xs transition-colors ${
                  active
                    ? "border-emerald-500/35 bg-emerald-500/8 text-foreground"
                    : done
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                    : "border-border bg-muted/20 text-muted-foreground"
                }`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded text-[10px] font-bold font-mono ${
                    active || done
                      ? "bg-emerald-500 text-black"
                      : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {done ? <RiCheckLine className="size-3" /> : s.n}
                </span>
                <s.icon className="size-3.5 shrink-0 hidden sm:block opacity-70" />
                <span className="font-semibold whitespace-nowrap">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        {/* Main panel */}
        <div className="lg:col-span-3 supabase-panel p-4 sm:p-6 min-w-0">
          <div className="flex items-center gap-2 pb-3 sm:pb-4 border-b border-border/40 mb-4 sm:mb-5">
            <div className="flex size-8 items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <RiTvLine className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate">
                {step === 1 ? "Configure Ingest Broadcast" : "RTMP Credentials"}
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-0.5">
                {step === 1 ? "Session parameters" : "OBS · Streamlabs · vMix"}
              </p>
            </div>
          </div>

          {!createdKey ? (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="broadcast-title"
                    className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider"
                  >
                    Broadcast Title
                  </label>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      title.length > 100 ? "text-amber-400" : "text-muted-foreground/60"
                    }`}
                  >
                    {title.length}/120
                  </span>
                </div>
                <Input
                  id="broadcast-title"
                  placeholder="e.g. Squad Rank Grinding!"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (titleError) setTitleError(null);
                  }}
                  aria-invalid={!!titleError}
                  aria-describedby={titleError ? "title-error" : undefined}
                  className={`h-10 text-sm bg-muted/20 border-border focus:border-emerald-500 supabase-input ${
                    titleError ? "border-destructive/50 focus:border-destructive" : ""
                  }`}
                />
                {titleError && (
                  <p
                    id="title-error"
                    className="flex items-center gap-1.5 text-[11px] text-destructive"
                  >
                    <RiErrorWarningLine className="size-3.5 shrink-0" />
                    {titleError}
                  </p>
                )}
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label
                  htmlFor="broadcast-tags"
                  className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider"
                >
                  Tags{" "}
                  <span className="normal-case font-medium tracking-normal text-muted-foreground/50">
                    (comma separated, optional)
                  </span>
                </label>
                <Input
                  id="broadcast-tags"
                  placeholder="e.g. gaming, valorant, english"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  className="h-10 text-sm bg-muted/20 border-border focus:border-emerald-500 supabase-input"
                />
                {tagsStr.trim() && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {tagsStr
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 12)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono bg-emerald-500/8 text-emerald-400/90 border border-emerald-500/15"
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Qualities */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    Transcoding Qualities
                  </label>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {selectedQualities.length} selected
                  </span>
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-2.5">
                  {QUALITIES.map((q) => {
                    const active = selectedQualities.includes(q.key);
                    return (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => toggleQuality(q.key)}
                        aria-pressed={active}
                        className={`flex items-center justify-between gap-2 p-3 rounded-md border text-left transition-all duration-150 min-h-[52px] ${
                          active
                            ? "bg-emerald-500/8 border-emerald-500/35 text-foreground shadow-[inset_0_0_0_1px_rgba(62,207,142,0.08)]"
                            : "bg-[#141414] border-border text-muted-foreground hover:bg-[#1a1a1a] hover:border-white/10"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold">{q.label}</span>
                            {q.rec && (
                              <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-400/80 bg-emerald-500/10 px-1 py-px rounded">
                                rec
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                            {q.detail}
                          </p>
                        </div>
                        <span
                          className={`size-4 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                            active
                              ? "bg-emerald-500 border-emerald-500 text-black"
                              : "border-border"
                          }`}
                        >
                          {active && <RiCheckLine className="size-2.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Privacy */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                  Privacy Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    aria-pressed={!isPrivate}
                    className={`flex items-center gap-3 p-3 rounded-md border text-left transition-all min-h-[56px] ${
                      !isPrivate
                        ? "bg-emerald-500/8 border-emerald-500/35 text-foreground"
                        : "bg-[#141414] border-border text-muted-foreground hover:bg-[#1a1a1a]"
                    }`}
                  >
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded border ${
                        !isPrivate
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <RiGlobalLine className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-none">Public</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
                        Listed on directory when live
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    aria-pressed={isPrivate}
                    className={`flex items-center gap-3 p-3 rounded-md border text-left transition-all min-h-[56px] ${
                      isPrivate
                        ? "bg-emerald-500/8 border-emerald-500/35 text-foreground"
                        : "bg-[#141414] border-border text-muted-foreground hover:bg-[#1a1a1a]"
                    }`}
                  >
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded border ${
                        isPrivate
                          ? "bg-violet-500/10 border-violet-500/30 text-violet-400"
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <RiLockLine className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-none">Private</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
                        Only people with the direct link
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Scheduling */}
              <div className="space-y-2.5 border-t border-border/40 pt-4">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                  Scheduling
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: "now" as const,
                        title: "Go live immediately",
                        desc: "Session stays READY until OBS connects",
                        icon: RiBroadcastLine,
                      },
                      {
                        id: "later" as const,
                        title: "Schedule for later",
                        desc: "Set a start time for your audience",
                        icon: RiTimeLine,
                      },
                    ] as const
                  ).map((opt) => {
                    const active = scheduleType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setScheduleType(opt.id)}
                        aria-pressed={active}
                        className={`flex items-start gap-2.5 p-3 rounded-md border text-left transition-all ${
                          active
                            ? "bg-emerald-500/8 border-emerald-500/35 text-foreground"
                            : "bg-[#141414] border-border text-muted-foreground hover:bg-[#1a1a1a]"
                        }`}
                      >
                        <span
                          className={`mt-0.5 size-3.5 shrink-0 rounded-full border flex items-center justify-center ${
                            active
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-border"
                          }`}
                        >
                          {active && (
                            <span className="size-1.5 rounded-full bg-black" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold flex items-center gap-1.5">
                            <opt.icon className="size-3.5 opacity-70" />
                            {opt.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground/75 mt-1 leading-snug">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {scheduleType === "later" && (
                  <div className="space-y-1.5 animate-fade-up">
                    <label
                      htmlFor="scheduled-at"
                      className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider"
                    >
                      Start time
                    </label>
                    <Input
                      id="scheduled-at"
                      type="datetime-local"
                      required
                      value={scheduledAt}
                      min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="h-10 text-sm bg-muted/20 border-border focus:border-emerald-500 supabase-input max-w-full"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-row items-center justify-end gap-2 pt-4 border-t border-border/40">
                <Button
                  type="button"
                  variant="ghost"
                  asChild
                  disabled={submitting}
                  className="h-9 text-xs text-muted-foreground"
                >
                  <Link href="/dashboard/streams">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || selectedQualities.length === 0}
                  className="btn-primary-flat h-9 px-4 text-xs gap-2"
                >
                  {submitting ? (
                    <>
                      <RiLoader4Line className="size-4 spin" />
                      Creating…
                    </>
                  ) : (
                    "Create setup"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            /* Success / credentials */
            <div className="space-y-4 sm:space-y-5 animate-fade-up">
              <div className="flex flex-col items-center justify-center text-center p-4 sm:p-5 rounded-md bg-emerald-500/5 border border-emerald-500/15">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/25 mb-3">
                  <RiCheckboxCircleLine className="size-7 text-emerald-400" />
                </div>
                <h4 className="text-sm sm:text-base font-bold text-foreground">
                  Setup configured successfully
                </h4>
                <p className="text-[11px] sm:text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
                  Paste the server URL and stream key into OBS Studio (Settings → Stream), then open
                  the studio to monitor your broadcast.
                </p>
              </div>

              <div className="space-y-3">
                {/* Server URL */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Server URL
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(RTMP_SERVER, "url")}
                      className="text-[10px] flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors px-1.5 py-1 rounded hover:bg-emerald-500/10"
                    >
                      {copiedUrl ? (
                        <RiCheckLine className="size-3.5" />
                      ) : (
                        <RiClipboardLine className="size-3.5" />
                      )}
                      {copiedUrl ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-md bg-[#111] border border-border text-[11px] sm:text-xs font-mono text-foreground/85 break-all select-all">
                    {RTMP_SERVER}
                  </div>
                </div>

                {/* Stream key */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Stream Ingest Key
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setKeyVisible((v) => !v)}
                        className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/40"
                        aria-label={keyVisible ? "Hide stream key" : "Show stream key"}
                      >
                        {keyVisible ? (
                          <RiEyeOffLine className="size-3.5" />
                        ) : (
                          <RiEyeLine className="size-3.5" />
                        )}
                        <span className="hidden sm:inline">{keyVisible ? "Hide" : "Show"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => createdKey && copyToClipboard(createdKey, "key")}
                        className="text-[10px] flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors px-1.5 py-1 rounded hover:bg-emerald-500/10"
                      >
                        {copiedKey ? (
                          <RiCheckLine className="size-3.5" />
                        ) : (
                          <RiClipboardLine className="size-3.5" />
                        )}
                        {copiedKey ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-md bg-[#111] border border-border text-[11px] sm:text-xs font-mono text-foreground/85 break-all select-all">
                    {keyVisible ? createdKey : maskKey(createdKey)}
                  </div>
                </div>
              </div>

              <div className="p-3 sm:p-3.5 bg-sky-500/5 border border-sky-500/15 rounded-md flex gap-3 text-left">
                <RiInformationLine className="size-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-foreground">Single-stream binding</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    This key is bound to stream{" "}
                    <span className="font-mono text-foreground/90 break-all">
                      {createdStreamId}
                    </span>
                    . Stopping OBS keeps the session READY so you can reconnect. Ending the broadcast
                    from Studio permanently revokes keys and creates a VOD.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3 border-t border-border/40">
                <Button variant="ghost" asChild className="h-10 sm:h-9 px-4 text-xs">
                  <Link href="/dashboard/streams">Back to Sessions</Link>
                </Button>
                <Button
                  onClick={() => router.push(`/dashboard/streams/${createdStreamId}`)}
                  className="btn-primary-flat h-10 sm:h-9 px-4 text-xs gap-1.5"
                >
                  Open Studio
                  <RiExternalLinkLine className="size-3.5 opacity-80" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Side guide — desktop sticky, mobile stacked */}
        <aside className="lg:col-span-2 space-y-3 sm:space-y-4 min-w-0">
          <div className="supabase-panel p-4 sm:p-5 space-y-4 lg:sticky lg:top-4">
            <div className="space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Quick start
              </p>
              <h4 className="text-sm font-bold tracking-tight">OBS Studio setup</h4>
            </div>
            <ol className="space-y-3">
              {[
                {
                  t: "Create setup",
                  d: "Fill title, qualities, and privacy, then generate credentials.",
                },
                {
                  t: "Point OBS at Castify",
                  d: "Settings → Stream → Custom. Paste Server URL + Stream Key.",
                },
                {
                  t: "Go live",
                  d: "Start Streaming in OBS. Studio shows LIVE when ingest is active.",
                },
                {
                  t: "Reconnect freely",
                  d: "Stop OBS anytime — session stays READY until you End Broadcast.",
                },
              ].map((item, i) => (
                <li key={item.t} className="flex gap-3">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-bold font-mono border border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                    style={{ color: PRIMARY }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs font-semibold text-foreground/90">{item.t}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      {item.d}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="pt-3 border-t border-border/40 space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Encoder tips
              </p>
              <ul className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-emerald-400/80 shrink-0">·</span>
                  Prefer 720p + 480p for most connections
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400/80 shrink-0">·</span>
                  Keyframe interval: 2 seconds
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400/80 shrink-0">·</span>
                  Never share your ingest key publicly
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
