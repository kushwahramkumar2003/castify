import { randomUUID } from "node:crypto";
import { prisma } from "@castify/db";
import { config } from "../config";
import {
  cleanEnvSecret,
  createRazorpayPlan,
  isRazorpayConfigured,
} from "./razorpay";

/**
 * Ensure a BillingPlan row for PRO exists.
 * Prefer RAZORPAY_PRO_PLAN_ID from Dashboard (avoids plans.create 401 when
 * Subscriptions API is restricted). Otherwise try create plan via API once.
 */
export async function ensureProBillingPlan() {
  const existing = await prisma.billingPlan.findUnique({
    where: { tier: "PRO" },
  });
  if (existing?.active) return existing;

  const amountPaise = config.BILLING_PRO_AMOUNT_PAISE;
  const currency = config.BILLING_CURRENCY || "INR";
  const configuredPlanId = cleanEnvSecret(config.RAZORPAY_PRO_PLAN_ID);

  // Best path: Dashboard-created plan id (no plans.create call)
  if (configuredPlanId) {
    return prisma.billingPlan.upsert({
      where: { tier: "PRO" },
      create: {
        id: randomUUID(),
        tier: "PRO",
        name: "Castify Pro Studio",
        amountPaise,
        currency,
        period: "monthly",
        interval: 1,
        razorpayPlanId: configuredPlanId,
        active: true,
      },
      update: {
        razorpayPlanId: configuredPlanId,
        amountPaise,
        currency,
        active: true,
        name: "Castify Pro Studio",
      },
    });
  }

  if (!isRazorpayConfigured()) {
    return null;
  }

  // Auto-create only works when Subscriptions product is enabled for the keys
  try {
    const rzpPlan = await createRazorpayPlan({
      name: "Castify Pro Studio",
      amountPaise,
      currency,
      period: "monthly",
      interval: 1,
      description: "Castify Pro — monthly subscription (test/live)",
    });

    return prisma.billingPlan.upsert({
      where: { tier: "PRO" },
      create: {
        id: randomUUID(),
        tier: "PRO",
        name: "Castify Pro Studio",
        amountPaise: rzpPlan.item.amount,
        currency: rzpPlan.item.currency || currency,
        period: rzpPlan.period || "monthly",
        interval: rzpPlan.interval || 1,
        razorpayPlanId: rzpPlan.id,
        active: true,
      },
      update: {
        razorpayPlanId: rzpPlan.id,
        amountPaise: rzpPlan.item.amount,
        currency: rzpPlan.item.currency || currency,
        active: true,
      },
    });
  } catch (err) {
    // Log full provider detail; never surface env/dashboard instructions to clients
    console.error("[ensureProBillingPlan] provider plan create failed", err);
    throw new Error("BILLING_PLAN_UNAVAILABLE");
  }
}
