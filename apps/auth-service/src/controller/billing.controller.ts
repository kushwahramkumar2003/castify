import {
  asyncHandler,
  castifyResponse,
  castifyError,
  zodErrors,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { prisma } from "@castify/db";
import type { Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { PLAN_CATALOG, formatInrFromPaise } from "../billing/planCatalog";
import { ensureProBillingPlan } from "../billing/ensureProPlan";
import {
  applySubscriptionEntity,
  mapRazorpayStatus,
  recordBillingPayment,
  syncUserPlanFromBilling,
} from "../billing/entitlementSync";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  getRazorpayKeyId,
  isRazorpayConfigured,
  unixToDate,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
  type RazorpaySubscriptionEntity,
} from "../billing/razorpay";
import { normalizePlan } from "../plans/qualityEntitlements";

const subscribeBody = z.object({
  tier: z.literal("PRO"),
});

const verifyBody = z.object({
  razorpay_payment_id: z.string().min(8).max(64),
  razorpay_subscription_id: z.string().min(8).max(64),
  razorpay_signature: z.string().min(16).max(256),
});

// ---------------------------------------------------------------------------
// GET /billing/plans
// ---------------------------------------------------------------------------
export const listBillingPlans = asyncHandler(
  async (_req: Request, res: Response) => {
    const proRow = await prisma.billingPlan.findUnique({
      where: { tier: "PRO" },
    });

    const plans = PLAN_CATALOG.map((p) => {
      if (p.tier === "PRO" && proRow) {
        return {
          ...p,
          amountPaise: proRow.amountPaise,
          currency: proRow.currency,
          period: proRow.period,
          interval: proRow.interval,
          displayPrice: formatInrFromPaise(proRow.amountPaise),
          razorpayLinked: true,
        };
      }
      return {
        ...p,
        displayPrice:
          p.tier === "FREE"
            ? "₹0"
            : p.tier === "ENTERPRISE"
              ? "Custom"
              : formatInrFromPaise(p.amountPaise),
        razorpayLinked: p.tier === "PRO" ? !!proRow : false,
      };
    });

    return castifyResponse(
      res,
      {
        plans,
        checkoutAvailable: isRazorpayConfigured(),
        currency: config.BILLING_CURRENCY || "INR",
      },
      STATUS_MSG.OK
    );
  }
);

// ---------------------------------------------------------------------------
// GET /billing/subscription
// ---------------------------------------------------------------------------
export const getMyBillingSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        email: true,
        fullName: true,
        username: true,
      },
    });
    if (!user) {
      return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
    }

    const sub = await prisma.billingSubscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        billingPlan: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    return castifyResponse(
      res,
      {
        plan: normalizePlan(user.plan),
        subscription: sub
          ? {
              id: sub.id,
              tier: sub.tier,
              status: sub.status,
              razorpaySubscriptionId: sub.razorpaySubscriptionId,
              currentStart: sub.currentStart,
              currentEnd: sub.currentEnd,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              planName: sub.billingPlan.name,
              amountPaise: sub.billingPlan.amountPaise,
              currency: sub.billingPlan.currency,
              displayPrice: formatInrFromPaise(sub.billingPlan.amountPaise),
              recentPayments: sub.payments.map((p) => ({
                id: p.id,
                razorpayPaymentId: p.razorpayPaymentId,
                amountPaise: p.amountPaise,
                currency: p.currency,
                status: p.status,
                createdAt: p.createdAt,
              })),
            }
          : null,
        checkoutAvailable: isRazorpayConfigured(),
      },
      STATUS_MSG.OK
    );
  }
);

export const createSubscriptionCheckout = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const parsed = subscribeBody.safeParse(req.body);
    if (!parsed.success) {
      return castifyError(
        res,
        STATUS_MSG.VALIDATION_FAILED,
        STATUS_CODE.UNPROCESSABLE,
        zodErrors(parsed.error)
      );
    }

    if (!isRazorpayConfigured()) {
      console.error("[billing/subscribe] payment provider not configured");
      return castifyError(
        res,
        "Checkout is temporarily unavailable. Please try again later.",
        STATUS_CODE.SERVICE_UNAVAILABLE
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plan: true,
        email: true,
        fullName: true,
        username: true,
      },
    });
    if (!user) {
      return castifyError(res, "User not found", STATUS_CODE.NOT_FOUND);
    }

    if (user.plan === "ENTERPRISE") {
      return castifyError(
        res,
        "Enterprise plan is managed offline. Contact support.",
        STATUS_CODE.CONFLICT
      );
    }

    const existingActive = await prisma.billingSubscription.findFirst({
      where: {
        userId,
        tier: "PRO",
        status: { in: ["CREATED", "AUTHENTICATED", "ACTIVE", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
    });

    // Reuse open CREATED subscription for retry (avoid spam)
    if (existingActive && existingActive.status !== "CREATED") {
      return castifyError(
        res,
        "You already have an active or pending Pro subscription.",
        STATUS_CODE.CONFLICT
      );
    }

    let plan;
    try {
      plan = await ensureProBillingPlan();
    } catch (err) {
      console.error("[billing/subscribe] ensureProBillingPlan", err);
      return castifyError(
        res,
        "We could not start checkout. Please try again later.",
        STATUS_CODE.BAD_GATEWAY
      );
    }
    if (!plan) {
      console.error("[billing/subscribe] PRO plan not linked in billing_plans");
      return castifyError(
        res,
        "Checkout is temporarily unavailable. Please try again later.",
        STATUS_CODE.SERVICE_UNAVAILABLE
      );
    }

    let razorpaySub: RazorpaySubscriptionEntity;
    let billingSubId: string;

    if (existingActive?.status === "CREATED") {
      // Return existing checkout payload
      razorpaySub = {
        id: existingActive.razorpaySubscriptionId,
        plan_id: plan.razorpayPlanId,
        status: "created",
      };
      billingSubId = existingActive.id;
    } else {
      try {
        razorpaySub = await createRazorpaySubscription({
          planId: plan.razorpayPlanId,
          totalCount: config.BILLING_SUBSCRIPTION_TOTAL_COUNT,
          notes: {
            userId,
            tier: "PRO",
            username: user.username,
          },
        });
      } catch (err) {
        console.error("[billing/subscribe] createRazorpaySubscription", err);
        return castifyError(
          res,
          "We could not start checkout. Please try again later.",
          STATUS_CODE.BAD_GATEWAY
        );
      }

      billingSubId = randomUUID();
      await prisma.billingSubscription.create({
        data: {
          id: billingSubId,
          userId,
          billingPlanId: plan.id,
          tier: "PRO",
          status: mapRazorpayStatus(razorpaySub.status || "created"),
          razorpaySubscriptionId: razorpaySub.id,
          razorpayCustomerId: razorpaySub.customer_id ?? null,
          currentStart: unixToDate(razorpaySub.current_start ?? undefined),
          currentEnd: unixToDate(razorpaySub.current_end ?? undefined),
        },
      });
    }

    return castifyResponse(
      res,
      {
        keyId: getRazorpayKeyId(),
        subscriptionId: razorpaySub.id,
        billingSubscriptionId: billingSubId,
        tier: "PRO" as const,
        name: plan.name,
        description: `${plan.name} — ${formatInrFromPaise(plan.amountPaise)} / month`,
        amountPaise: plan.amountPaise,
        currency: plan.currency,
        prefill: {
          name: user.fullName || user.username,
          email: user.email || undefined,
        },
      },
      "Subscription created — complete payment in Checkout"
    );
  }
);

// ---------------------------------------------------------------------------
// POST /billing/verify
// ---------------------------------------------------------------------------
export const verifySubscriptionPayment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const parsed = verifyBody.safeParse(req.body);
    if (!parsed.success) {
      return castifyError(
        res,
        STATUS_MSG.VALIDATION_FAILED,
        STATUS_CODE.UNPROCESSABLE,
        zodErrors(parsed.error)
      );
    }

    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = parsed.data;

    const ok = verifySubscriptionPaymentSignature({
      razorpayPaymentId: razorpay_payment_id,
      razorpaySubscriptionId: razorpay_subscription_id,
      razorpaySignature: razorpay_signature,
    });
    if (!ok) {
      return castifyError(
        res,
        "We could not confirm this payment. Please try again or contact support.",
        STATUS_CODE.BAD_REQUEST
      );
    }

    const sub = await prisma.billingSubscription.findUnique({
      where: { razorpaySubscriptionId: razorpay_subscription_id },
      include: { billingPlan: true },
    });
    if (!sub || sub.userId !== userId) {
      return castifyError(
        res,
        "Subscription not found for this account",
        STATUS_CODE.NOT_FOUND
      );
    }

    // Fetch live status from Razorpay (authoritative)
    let entity: RazorpaySubscriptionEntity;
    try {
      entity = await fetchRazorpaySubscription(razorpay_subscription_id);
    } catch {
      entity = {
        id: razorpay_subscription_id,
        plan_id: sub.billingPlan.razorpayPlanId,
        status: "authenticated",
      };
    }

    await applySubscriptionEntity({
      razorpaySubscriptionId: razorpay_subscription_id,
      entity,
      rawPayload: { verify: true, payment_id: razorpay_payment_id },
    });

    // Auth payment often lands as authenticated/active — force PRO on verified signature
    const status = mapRazorpayStatus(entity.status);
    if (
      status === "AUTHENTICATED" ||
      status === "ACTIVE" ||
      status === "CREATED"
    ) {
      await prisma.billingSubscription.update({
        where: { id: sub.id },
        data: {
          status: status === "CREATED" ? "AUTHENTICATED" : status,
        },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { plan: "PRO" },
      });
    }

    await recordBillingPayment({
      billingSubscriptionId: sub.id,
      razorpayPaymentId: razorpay_payment_id,
      amountPaise: sub.billingPlan.amountPaise,
      currency: sub.billingPlan.currency,
      status: "captured",
    });

    const plan = await syncUserPlanFromBilling(userId);

    return castifyResponse(
      res,
      {
        verified: true,
        plan,
        subscriptionId: razorpay_subscription_id,
        paymentId: razorpay_payment_id,
      },
      "Payment verified"
    );
  }
);

// ---------------------------------------------------------------------------
// POST /billing/cancel
// ---------------------------------------------------------------------------
export const cancelMySubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const sub = await prisma.billingSubscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "AUTHENTICATED", "PENDING", "PAUSED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!sub) {
      return castifyError(
        res,
        "No active subscription to cancel",
        STATUS_CODE.NOT_FOUND
      );
    }

    if (!isRazorpayConfigured()) {
      console.error("[billing/cancel] payment provider not configured");
      return castifyError(
        res,
        "We could not cancel right now. Please try again later.",
        STATUS_CODE.SERVICE_UNAVAILABLE
      );
    }

    let entity: RazorpaySubscriptionEntity;
    try {
      // cancel at cycle end
      entity = await cancelRazorpaySubscription(
        sub.razorpaySubscriptionId,
        true
      );
    } catch (err: unknown) {
      console.error("[billing/cancel] provider error", err);
      return castifyError(
        res,
        "We could not cancel right now. Please try again later.",
        STATUS_CODE.BAD_GATEWAY
      );
    }

    await prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        status: mapRazorpayStatus(entity.status || "cancelled"),
        cancelAtPeriodEnd: true,
        currentStart: unixToDate(entity.current_start ?? undefined),
        currentEnd: unixToDate(entity.current_end ?? undefined),
        rawLastPayload: entity as object,
      },
    });

    const plan = await syncUserPlanFromBilling(userId);

    return castifyResponse(
      res,
      {
        cancelled: true,
        cancelAtPeriodEnd: true,
        plan,
        currentEnd: unixToDate(entity.current_end ?? undefined),
        status: mapRazorpayStatus(entity.status || "cancelled"),
      },
      "Subscription will cancel at the end of the billing period"
    );
  }
);

// ---------------------------------------------------------------------------
// POST /billing/webhooks/razorpay  (raw body)
// ---------------------------------------------------------------------------
export const razorpayWebhook = asyncHandler(
  async (req: Request, res: Response) => {
    const signature =
      (req.headers["x-razorpay-signature"] as string | undefined) ||
      (req.headers["X-Razorpay-Signature"] as string | undefined);

    const rawBody =
      typeof req.body === "string"
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : "";

    if (!rawBody) {
      return castifyError(res, "Empty webhook body", STATUS_CODE.BAD_REQUEST);
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      return castifyError(
        res,
        "Invalid webhook signature",
        STATUS_CODE.UNAUTHORIZED
      );
    }

    let event: {
      id?: string;
      event?: string;
      payload?: {
        subscription?: { entity?: RazorpaySubscriptionEntity };
        payment?: {
          entity?: {
            id?: string;
            amount?: number;
            currency?: string;
            status?: string;
          };
        };
      };
    };

    try {
      event = JSON.parse(rawBody);
    } catch {
      return castifyError(res, "Invalid JSON", STATUS_CODE.BAD_REQUEST);
    }

    const eventId = event.id || `${event.event}-${Date.now()}`;
    const eventType = event.event || "unknown";

    try {
      await prisma.billingWebhookEvent.create({
        data: {
          id: randomUUID(),
          eventId,
          eventType,
        },
      });
    } catch {
      // Duplicate event — already processed
      return castifyResponse(res, { ok: true, duplicate: true }, STATUS_MSG.OK);
    }

    const subEntity = event.payload?.subscription?.entity;
    if (subEntity?.id) {
      const local = await prisma.billingSubscription.findUnique({
        where: { razorpaySubscriptionId: subEntity.id },
      });

      if (local) {
        if (
          eventType === "subscription.cancelled" ||
          eventType === "subscription.completed"
        ) {
          await prisma.billingSubscription.update({
            where: { id: local.id },
            data: {
              status: mapRazorpayStatus(subEntity.status),
              cancelAtPeriodEnd:
                eventType === "subscription.cancelled"
                  ? true
                  : local.cancelAtPeriodEnd,
              currentStart: unixToDate(subEntity.current_start ?? undefined),
              currentEnd: unixToDate(subEntity.current_end ?? undefined),
              rawLastPayload: event as object,
            },
          });
        } else if (eventType === "subscription.paused") {
          await prisma.billingSubscription.update({
            where: { id: local.id },
            data: {
              status: "PAUSED",
              rawLastPayload: event as object,
            },
          });
        } else {
          await applySubscriptionEntity({
            razorpaySubscriptionId: subEntity.id,
            entity: subEntity,
            rawPayload: event,
          });
        }

        const payment = event.payload?.payment?.entity;
        if (payment?.id && eventType === "subscription.charged") {
          await recordBillingPayment({
            billingSubscriptionId: local.id,
            razorpayPaymentId: payment.id,
            amountPaise: payment.amount ?? 0,
            currency: payment.currency || "INR",
            status: payment.status || "captured",
          });
        }

        await syncUserPlanFromBilling(local.userId);
      }
    }

    return castifyResponse(res, { ok: true }, STATUS_MSG.OK);
  }
);
