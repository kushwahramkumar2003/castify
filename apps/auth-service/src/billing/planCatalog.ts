import type { PlanTier } from "../plans/qualityEntitlements";

export type PublicBillingPlan = {
  tier: PlanTier;
  name: string;
  amountPaise: number;
  currency: string;
  period: string;
  interval: number;
  features: string[];
  selfServe: boolean;
  cta: string;
};

/** Static catalog features shown on Billing UI (amounts come from DB when live). */
export const PLAN_CATALOG: PublicBillingPlan[] = [
  {
    tier: "FREE",
    name: "Free Node",
    amountPaise: 0,
    currency: "INR",
    period: "forever",
    interval: 0,
    features: [
      "1 Ingest Keyset",
      "720p Max Transcoding",
      "Community Edge Relay",
      "AES-128 Stream Security",
      "7-Day Recording Retention",
    ],
    selfServe: false,
    cta: "Current free tier",
  },
  {
    tier: "PRO",
    name: "Pro Studio",
    amountPaise: 99_900,
    currency: "INR",
    period: "monthly",
    interval: 1,
    features: [
      "5 Ingest Keysets",
      "2K / 1080p Resolution ladder",
      "Priority Edge Nodes",
      "AES-128 Stream Security",
      "30-Day Capture Retention",
      "Viewer Analytics",
      "Custom Ingest Gateways",
    ],
    selfServe: true,
    cta: "Upgrade to Pro",
  },
  {
    tier: "ENTERPRISE",
    name: "Enterprise",
    amountPaise: 0,
    currency: "INR",
    period: "custom",
    interval: 0,
    features: [
      "Unlimited Ingest Keys",
      "Full quality ladder",
      "Dedicated Edge Nodes",
      "99.99% Uptime SLA",
      "Unlimited Archive Storage",
      "White-label Player SDK",
      "24/7 Priority Support",
    ],
    selfServe: false,
    cta: "Contact us",
  },
];

export function formatInrFromPaise(paise: number): string {
  if (!Number.isFinite(paise) || paise <= 0) return "₹0";
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}
