"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PlanTier } from "@/lib/api";

const STYLES: Record<
  PlanTier,
  { label: string; className: string }
> = {
  FREE: {
    label: "Free",
    className:
      "bg-neutral-800/80 text-muted-foreground border-border",
  },
  PRO: {
    label: "Pro",
    className:
      "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
  ENTERPRISE: {
    label: "Enterprise",
    className:
      "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
};

export function PlanBadge({
  plan = "FREE",
  size = "sm",
  href = "/dashboard/billing",
  className,
}: {
  plan?: PlanTier | string | null;
  size?: "xs" | "sm";
  href?: string | null;
  className?: string;
}) {
  const tier: PlanTier =
    plan === "PRO" || plan === "ENTERPRISE" || plan === "FREE"
      ? plan
      : "FREE";
  const style = STYLES[tier];
  const pad =
    size === "xs"
      ? "px-1.5 py-0.5 text-[8px]"
      : "px-2 py-0.5 text-[9px]";

  const inner = (
    <span
      className={cn(
        "inline-flex items-center font-bold uppercase tracking-wider rounded border",
        pad,
        style.className,
        className
      )}
    >
      {style.label}
    </span>
  );

  if (!href) return inner;
  return (
    <Link
      href={href}
      className="inline-flex hover:opacity-90 transition-opacity"
      title="View plan & billing"
    >
      {inner}
    </Link>
  );
}
