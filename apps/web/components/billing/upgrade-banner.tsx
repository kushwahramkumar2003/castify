"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RiFlashlightLine, RiArrowRightLine } from "react-icons/ri";
import type { PlanTier } from "@/lib/api";

export function UpgradeBanner({
  plan = "FREE",
  compact = false,
  message,
}: {
  plan?: PlanTier | string | null;
  compact?: boolean;
  message?: string;
}) {
  if (plan === "PRO" || plan === "ENTERPRISE") return null;

  return (
    <div
      className={
        compact
          ? "flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-sky-500/25 bg-sky-500/8 px-3 py-2.5"
          : "supabase-panel p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-sky-500/20"
      }
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-400">
          <RiFlashlightLine className="size-4" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-semibold text-foreground/90">
            Unlock Pro Studio
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {message ??
              "2K/1080p ladder, more stream keys, concurrent lives, and priority features."}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="btn-primary-flat h-8 text-xs gap-1.5 shrink-0"
        asChild
      >
        <Link href="/dashboard/billing">
          Upgrade
          <RiArrowRightLine className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
