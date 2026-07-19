import { z } from "zod";

/** Platform-supported ladder (must match transcoder profiles) */
export const ALL_QUALITY_LABELS = [
  "2k",
  "1080p",
  "720p",
  "480p",
  "360p",
] as const;

export type QualityLabel = (typeof ALL_QUALITY_LABELS)[number];

export const qualityLabelSchema = z.enum(ALL_QUALITY_LABELS);

export type PlanTier = "FREE" | "PRO" | "ENTERPRISE";

/** Highest rung allowed (inclusive) per plan */
export const PLAN_MAX_QUALITY: Record<PlanTier, QualityLabel> = {
  FREE: "720p",
  PRO: "2k",
  ENTERPRISE: "2k",
};

/** Display order high → low */
const QUALITY_RANK: Record<QualityLabel, number> = {
  "2k": 5,
  "1080p": 4,
  "720p": 3,
  "480p": 2,
  "360p": 1,
};

const PLAN_RANK: Record<PlanTier, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

export type PlanLimits = {
  maxQuality: QualityLabel;
  allowedQualities: QualityLabel[];
  /** Non-revoked stream keys across the account */
  maxActiveStreamKeys: number;
  /** Simultaneous isLive sessions */
  maxConcurrentLive: number;
  privateStreams: boolean;
  advancedAnalytics: boolean;
  inviteCodes: boolean;
  label: string;
};

const PLAN_LIMITS: Record<PlanTier, Omit<PlanLimits, "allowedQualities" | "maxQuality">> = {
  FREE: {
    maxActiveStreamKeys: 1,
    maxConcurrentLive: 1,
    privateStreams: true,
    advancedAnalytics: false,
    inviteCodes: true,
    label: "Free Node",
  },
  PRO: {
    maxActiveStreamKeys: 5,
    maxConcurrentLive: 5,
    privateStreams: true,
    advancedAnalytics: true,
    inviteCodes: true,
    label: "Pro Studio",
  },
  ENTERPRISE: {
    maxActiveStreamKeys: 100,
    maxConcurrentLive: 50,
    privateStreams: true,
    advancedAnalytics: true,
    inviteCodes: true,
    label: "Enterprise",
  },
};

export function planAllowsQuality(plan: PlanTier, q: QualityLabel): boolean {
  return QUALITY_RANK[q] <= QUALITY_RANK[PLAN_MAX_QUALITY[plan]];
}

export function allowedQualitiesForPlan(plan: PlanTier): QualityLabel[] {
  return ALL_QUALITY_LABELS.filter((q) => planAllowsQuality(plan, q)).sort(
    (a, b) => QUALITY_RANK[b] - QUALITY_RANK[a]
  );
}

export function normalizePlan(plan: string | null | undefined): PlanTier {
  if (plan === "PRO" || plan === "ENTERPRISE" || plan === "FREE") return plan;
  return "FREE";
}

export function planMeetsMinimum(plan: PlanTier, min: PlanTier): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[min];
}

export function planLimits(plan: PlanTier): PlanLimits {
  const base = PLAN_LIMITS[plan];
  return {
    ...base,
    maxQuality: PLAN_MAX_QUALITY[plan],
    allowedQualities: allowedQualitiesForPlan(plan),
  };
}

/**
 * Zod-validated quality list for stream create.
 * Rejects unknown labels and qualities above the user's plan.
 */
export function parseStreamQualities(
  raw: unknown,
  plan: PlanTier
):
  | { ok: true; qualities: QualityLabel[] }
  | { ok: false; message: string; errors?: Record<string, string[]> } {
  const schema = z
    .array(qualityLabelSchema)
    .min(1, "Select at least one quality")
    .max(5);

  const parsed = schema.safeParse(
    Array.isArray(raw) ? raw : raw == null ? ["720p", "480p"] : raw
  );
  if (!parsed.success) {
    return {
      ok: false,
      message: "Invalid quality selection",
      errors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join(".") || "qualities", [i.message]])
      ),
    };
  }

  const unique = [...new Set(parsed.data)];
  const disallowed = unique.filter((q) => !planAllowsQuality(plan, q));
  if (disallowed.length > 0) {
    const max = PLAN_MAX_QUALITY[plan];
    return {
      ok: false,
      message: `Your ${plan} plan allows up to ${max}. Not allowed: ${disallowed.join(", ")}. Upgrade in Billing to unlock higher rungs.`,
      errors: {
        qualities: disallowed.map(
          (q) => `${q} is not included in the ${plan} plan (max ${max})`
        ),
      },
    };
  }

  // Stable high→low order for ABR master playlists
  const qualities = unique.sort((a, b) => QUALITY_RANK[b] - QUALITY_RANK[a]);
  return { ok: true, qualities };
}

/** Public payload for FE gating + billing UI */
export function planPublicMeta(plan: PlanTier) {
  const limits = planLimits(plan);
  return {
    plan,
    maxQuality: limits.maxQuality,
    allowedQualities: limits.allowedQualities,
    labels: limits.label,
    maxActiveStreamKeys: limits.maxActiveStreamKeys,
    maxConcurrentLive: limits.maxConcurrentLive,
    privateStreams: limits.privateStreams,
    advancedAnalytics: limits.advancedAnalytics,
    inviteCodes: limits.inviteCodes,
    premiumQualities: ALL_QUALITY_LABELS.filter(
      (q) => !planAllowsQuality("FREE", q)
    ),
  };
}
