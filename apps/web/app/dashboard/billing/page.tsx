"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiBankCardLine,
  RiCheckboxCircleLine,
  RiFlashlightLine,
  RiShieldLine,
  RiGlobalLine,
  RiArrowRightLine,
} from "react-icons/ri";

const GREEN = "#3ecf8e";
const BLUE = "#1998d5";

const plans = [
  {
    name: "Free Node",
    price: "$0",
    period: "forever",
    current: true,
    features: [
      "1 Ingest Keyset",
      "720p Max Transcoding",
      "Community Edge Relay",
      "AES-128 Stream Security",
      "7-Day Recording Retention",
    ],
    cta: "Current Plan",
    disabled: true,
    accent: GREEN,
  },
  {
    name: "Pro Studio",
    price: "$12",
    period: "/ month",
    current: false,
    features: [
      "5 Ingest Keysets",
      "4K / 2K Resolution",
      "Priority Edge Nodes",
      "AES-128 E2E Encryption",
      "30-Day Capture Retention",
      "Viewer Analytics",
      "Custom Ingest Gateways",
    ],
    cta: "Upgrade",
    disabled: false,
    accent: BLUE,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    current: false,
    features: [
      "Unlimited Ingest Keys",
      "8K UHD Ladder",
      "Dedicated Edge Nodes",
      "99.99% Uptime SLA",
      "Unlimited Archive Storage",
      "White-label Player SDK",
      "24/7 Priority Support",
    ],
    cta: "Contact Us",
    disabled: false,
    accent: "#8a5cfa",
  },
];

export default function BillingPage() {
  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Billing"
        description="Your plan and payment methods."
      />

      <div
        className="supabase-panel p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ borderColor: "rgba(62, 207, 142, 0.2)" }}
      >
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <RiBankCardLine className="size-5" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold tracking-tight text-foreground/90">
                Free Node Subscription
              </h3>
              <Badge className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded border bg-emerald-500/8 text-emerald-400 border-emerald-500/20">
                ACTIVE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
              You are on the free tier. Upgrade for priority nodes and longer retention.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="btn-primary-flat shrink-0 px-4 h-9 gap-1.5 text-xs w-full sm:w-auto"
        >
          <RiFlashlightLine className="size-3.5" /> Upgrade
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="supabase-panel supabase-panel-interactive p-5 sm:p-6 flex flex-col justify-between min-h-0 md:min-h-[400px] relative overflow-hidden"
            style={
              plan.current ? { borderColor: "rgba(62, 207, 142, 0.3)" } : undefined
            }
          >
            {plan.current && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold tracking-tight text-foreground/90">
                  {plan.name}
                </h4>
                {plan.current && (
                  <Badge
                    variant="secondary"
                    className="text-[8px] font-bold uppercase tracking-wider rounded px-1.5 bg-[#1f1f1f] shrink-0"
                  >
                    Active
                  </Badge>
                )}
              </div>

              <div className="flex items-baseline gap-1 pt-0.5">
                <span
                  className="text-2xl sm:text-3xl font-extrabold tracking-tight stat-value"
                  style={{ color: plan.accent }}
                >
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {plan.period}
                  </span>
                )}
              </div>

              <Separator className="opacity-30" />

              <ul className="space-y-2 pt-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-xs text-[#a0a0a0] leading-relaxed"
                  >
                    <RiCheckboxCircleLine className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-5 sm:pt-6">
              <Button
                className={`w-full gap-1.5 h-10 sm:h-9 text-xs ${
                  plan.current ? "btn-secondary-flat" : "btn-primary-flat"
                }`}
                variant="secondary"
                disabled={plan.disabled}
              >
                {plan.cta}
                {!plan.disabled && <RiArrowRightLine className="size-4" />}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="supabase-panel p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <RiShieldLine className="size-4 text-emerald-400 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Payment methods
          </h3>
        </div>

        <div className="empty-state !py-8 sm:!py-10 space-y-3">
          <div className="flex size-12 items-center justify-center rounded-md bg-muted/20 border border-border mb-1">
            <RiGlobalLine className="size-6 text-muted-foreground/40" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">No payment method on file</p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mx-auto">
              Add a card to subscribe to higher capacity tiers when you are ready.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="btn-secondary-flat px-4 gap-1.5 h-9 text-xs mt-1"
          >
            <RiBankCardLine className="size-3.5" /> Add billing method
          </Button>
        </div>
      </div>
    </div>
  );
}
