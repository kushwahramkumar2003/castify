import { randomUUID } from "node:crypto";
import { prisma } from "@castify/db";
import type { BillingSubStatus, PlanTier } from "@castify/db";
import { unixToDate, type RazorpaySubscriptionEntity } from "./razorpay";

const ACTIVE_STATUSES: BillingSubStatus[] = [
  "AUTHENTICATED",
  "ACTIVE",
];

const DOWNGRADE_STATUSES: BillingSubStatus[] = [
  "HALTED",
  "CANCELLED",
  "COMPLETED",
  "EXPIRED",
  "PAUSED",
];

export function mapRazorpayStatus(status: string): BillingSubStatus {
  switch (status) {
    case "created":
      return "CREATED";
    case "authenticated":
      return "AUTHENTICATED";
    case "active":
      return "ACTIVE";
    case "pending":
      return "PENDING";
    case "halted":
      return "HALTED";
    case "paused":
      return "PAUSED";
    case "cancelled":
      return "CANCELLED";
    case "completed":
      return "COMPLETED";
    case "expired":
      return "EXPIRED";
    default:
      return "CREATED";
  }
}

/**
 * Apply Razorpay subscription entity to DB and sync User.plan.
 * ENTERPRISE is never auto-set from Razorpay (manual/contact only).
 */
export async function applySubscriptionEntity(opts: {
  razorpaySubscriptionId: string;
  entity: RazorpaySubscriptionEntity;
  rawPayload?: unknown;
}): Promise<void> {
  const status = mapRazorpayStatus(opts.entity.status);
  const sub = await prisma.billingSubscription.findUnique({
    where: { razorpaySubscriptionId: opts.razorpaySubscriptionId },
  });
  if (!sub) return;

  await prisma.billingSubscription.update({
    where: { id: sub.id },
    data: {
      status,
      razorpayCustomerId: opts.entity.customer_id ?? sub.razorpayCustomerId,
      currentStart: unixToDate(opts.entity.current_start ?? undefined),
      currentEnd: unixToDate(opts.entity.current_end ?? undefined),
      rawLastPayload: opts.rawPayload
        ? (opts.rawPayload as object)
        : undefined,
    },
  });

  await syncUserPlanFromBilling(sub.userId);
}

export async function syncUserPlanFromBilling(userId: string): Promise<PlanTier> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) return "FREE";

  // Manual enterprise stays
  if (user.plan === "ENTERPRISE") return "ENTERPRISE";

  const active = await prisma.billingSubscription.findFirst({
    where: {
      userId,
      tier: "PRO",
      status: { in: ACTIVE_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (active) {
    if (user.plan !== "PRO") {
      await prisma.user.update({
        where: { id: userId },
        data: { plan: "PRO" },
      });
    }
    return "PRO";
  }

  // Pending payment issues: keep PRO briefly if still pending (soft grace)
  const pending = await prisma.billingSubscription.findFirst({
    where: {
      userId,
      tier: "PRO",
      status: "PENDING",
    },
  });
  if (pending) {
    return user.plan === "PRO" ? "PRO" : "FREE";
  }

  const dead = await prisma.billingSubscription.findFirst({
    where: {
      userId,
      tier: "PRO",
      status: { in: DOWNGRADE_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Cancel at period end: keep PRO until currentEnd
  if (
    dead?.status === "CANCELLED" &&
    dead.cancelAtPeriodEnd &&
    dead.currentEnd &&
    dead.currentEnd.getTime() > Date.now()
  ) {
    if (user.plan !== "PRO") {
      await prisma.user.update({
        where: { id: userId },
        data: { plan: "PRO" },
      });
    }
    return "PRO";
  }

  if (user.plan === "PRO") {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE" },
    });
  }
  return "FREE";
}

export async function recordBillingPayment(opts: {
  billingSubscriptionId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  currency: string;
  status: string;
}): Promise<void> {
  await prisma.billingPayment.upsert({
    where: { razorpayPaymentId: opts.razorpayPaymentId },
    create: {
      id: randomUUID(),
      billingSubscriptionId: opts.billingSubscriptionId,
      razorpayPaymentId: opts.razorpayPaymentId,
      amountPaise: opts.amountPaise,
      currency: opts.currency,
      status: opts.status,
    },
    update: {
      status: opts.status,
      amountPaise: opts.amountPaise,
    },
  });
}
