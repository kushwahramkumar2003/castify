import Razorpay from "razorpay";
import crypto from "node:crypto";
import { config } from "../config";

let client: Razorpay | null = null;

/** Trim whitespace/quotes that often sneak into .env values */
export function cleanEnvSecret(v: string | undefined | null): string {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "");
}

export function isRazorpayConfigured(): boolean {
  return !!(
    cleanEnvSecret(config.RAZORPAY_KEY_ID) &&
    cleanEnvSecret(config.RAZORPAY_KEY_SECRET)
  );
}

export function getRazorpayKeyId(): string {
  const id = cleanEnvSecret(config.RAZORPAY_KEY_ID);
  if (!id) {
    throw new Error("RAZORPAY_KEY_ID is not configured");
  }
  return id;
}

export function getRazorpay(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test mode keys)."
    );
  }
  if (!client) {
    client = new Razorpay({
      key_id: cleanEnvSecret(config.RAZORPAY_KEY_ID),
      key_secret: cleanEnvSecret(config.RAZORPAY_KEY_SECRET),
    });
  }
  return client;
}

/**
 * Verify Standard Checkout subscription payment signature.
 * HMAC-SHA256(payment_id + "|" + subscription_id, key_secret)
 * @see https://razorpay.com/docs/payments/subscriptions/integration-guide/
 */
export function verifySubscriptionPaymentSignature(opts: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}): boolean {
  const secret = config.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const body = `${opts.razorpayPaymentId}|${opts.razorpaySubscriptionId}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(opts.razorpaySignature, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Verify Razorpay webhook signature using the webhook secret.
 * Must use the raw request body string (not re-serialized JSON).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | undefined
): boolean {
  const secret = config.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

export type RazorpayPlanEntity = {
  id: string;
  period: string;
  interval: number;
  item: {
    name: string;
    amount: number;
    currency: string;
    description?: string;
  };
};

export type RazorpaySubscriptionEntity = {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  total_count?: number;
  paid_count?: number;
  remaining_count?: number;
  notes?: Record<string, string> | string[];
};

/**
 * Normalize Razorpay SDK errors into Error instances.
 * Important: do NOT preserve statusCode 401 — Express would surface that as
 * "Unauthorized" and the FE thinks the Castify session died.
 */
export function wrapRazorpayError(err: unknown, action: string): Error {
  const e = err as {
    statusCode?: number;
    error?: { code?: string; description?: string; reason?: string };
    message?: string;
  } | null;

  const code = e?.error?.code ?? e?.statusCode;
  const desc =
    e?.error?.description ||
    e?.error?.reason ||
    e?.message ||
    (typeof err === "string" ? err : null) ||
    "Unknown Razorpay error";

  let hint = "";
  if (
    e?.statusCode === 401 ||
    code === 401 ||
    String(code) === "401" ||
    /authentication|unauthorized|access denied/i.test(String(desc))
  ) {
    if (action.includes("plan") || action.includes("subscription")) {
      hint =
        " Your API keys work for Payments, but Plans/Subscriptions returned 401. In Razorpay Dashboard (Test Mode): enable Product → Subscriptions, create a monthly Plan, set RAZORPAY_PRO_PLAN_ID=plan_xxx, then restart auth-service. api-gateway does not need Razorpay env vars.";
    } else {
      hint =
        " Check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (Test Mode, no quotes/spaces). Restart auth-service after changing .env.";
    }
  }

  const message = `Razorpay ${action} failed${code != null ? ` [${code}]` : ""}: ${desc}.${hint}`;
  const out = new Error(message);
  // Always treat upstream payment API failures as bad gateway, never session 401
  (out as Error & { statusCode?: number }).statusCode = 502;
  return out;
}

export async function createRazorpayPlan(opts: {
  name: string;
  amountPaise: number;
  currency: string;
  period?: string;
  interval?: number;
  description?: string;
}): Promise<RazorpayPlanEntity> {
  const rzp = getRazorpay();
  try {
    const plan = await rzp.plans.create({
      period: opts.period ?? "monthly",
      interval: opts.interval ?? 1,
      item: {
        name: opts.name,
        amount: opts.amountPaise,
        currency: opts.currency,
        description: opts.description ?? opts.name,
      },
    });
    return plan as unknown as RazorpayPlanEntity;
  } catch (err) {
    throw wrapRazorpayError(err, "plans.create");
  }
}

export async function createRazorpaySubscription(opts: {
  planId: string;
  totalCount: number;
  notes: Record<string, string>;
  customerNotify?: boolean;
}): Promise<RazorpaySubscriptionEntity> {
  const rzp = getRazorpay();
  try {
    const sub = await rzp.subscriptions.create({
      plan_id: opts.planId,
      total_count: opts.totalCount,
      quantity: 1,
      customer_notify: opts.customerNotify === false ? 0 : 1,
      notes: opts.notes,
    });
    return sub as unknown as RazorpaySubscriptionEntity;
  } catch (err) {
    throw wrapRazorpayError(err, "subscriptions.create");
  }
}

export async function fetchRazorpaySubscription(
  subscriptionId: string
): Promise<RazorpaySubscriptionEntity> {
  const rzp = getRazorpay();
  try {
    const sub = await rzp.subscriptions.fetch(subscriptionId);
    return sub as unknown as RazorpaySubscriptionEntity;
  } catch (err) {
    throw wrapRazorpayError(err, "subscriptions.fetch");
  }
}

/** Cancel at cycle end (cancel_at_cycle_end = 1) when possible. */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  atCycleEnd = true
): Promise<RazorpaySubscriptionEntity> {
  const rzp = getRazorpay();
  try {
    const sub = await rzp.subscriptions.cancel(subscriptionId, atCycleEnd);
    return sub as unknown as RazorpaySubscriptionEntity;
  } catch (err) {
    throw wrapRazorpayError(err, "subscriptions.cancel");
  }
}

export function unixToDate(sec: number | null | undefined): Date | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  return new Date(sec * 1000);
}
