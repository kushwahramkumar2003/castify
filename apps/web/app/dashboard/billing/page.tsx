"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/dashboard/page-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth";
import {
  api,
  type BillingPlanPublic,
  type BillingSubscriptionPublic,
  type PlanTier,
} from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { userFacingError } from "@/lib/user-facing-error";
import { toast } from "sonner";
import { PlanBadge } from "@/components/billing/plan-badge";
import {
  RiBankCardLine,
  RiCheckboxCircleLine,
  RiFlashlightLine,
  RiShieldLine,
  RiGlobalLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiCloseCircleLine,
} from "react-icons/ri";

const GREEN = "#3ecf8e";
const BLUE = "#1998d5";
const PURPLE = "#8a5cfa";

const ACCENT: Record<PlanTier, string> = {
  FREE: GREEN,
  PRO: BLUE,
  ENTERPRISE: PURPLE,
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

/** Friendly status for humans — no raw enum dumps */
function statusLabel(status: string | undefined, plan: PlanTier): string {
  if (!status) {
    return plan === "FREE" ? "Free" : plan;
  }
  const map: Record<string, string> = {
    CREATED: "Pending payment",
    AUTHENTICATED: "Active",
    ACTIVE: "Active",
    PENDING: "Payment pending",
    HALTED: "Paused",
    PAUSED: "Paused",
    CANCELLED: "Cancelled",
    COMPLETED: "Ended",
    EXPIRED: "Expired",
  };
  return map[status] ?? "Active";
}

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const confirm = useConfirm();

  const [plans, setPlans] = useState<BillingPlanPublic[]>([]);
  const [currentPlan, setCurrentPlan] = useState<PlanTier>("FREE");
  const [subscription, setSubscription] =
    useState<BillingSubscriptionPublic | null>(null);
  const [checkoutAvailable, setCheckoutAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"subscribe" | "cancel" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        api.getBillingPlans(),
        api.getBillingSubscription().catch(() => null),
      ]);
      setPlans(plansRes.data.plans);
      const available =
        plansRes.data.checkoutAvailable ??
        (plansRes.data as { razorpayEnabled?: boolean }).razorpayEnabled ??
        true;
      setCheckoutAvailable(!!available);
      if (subRes?.data) {
        setCurrentPlan(subRes.data.plan);
        setSubscription(subRes.data.subscription);
        setCheckoutAvailable(
          !!(
            subRes.data.checkoutAvailable ??
            (subRes.data as { razorpayEnabled?: boolean }).razorpayEnabled ??
            available
          )
        );
      } else if (user?.plan) {
        setCurrentPlan(user.plan);
      }
    } catch {
      toast.error("Could not load billing. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user?.plan]);

  useEffect(() => {
    void load();
  }, [load]);

  const isProActive =
    currentPlan === "PRO" ||
    subscription?.status === "ACTIVE" ||
    subscription?.status === "AUTHENTICATED";

  const handleSubscribe = async () => {
    if (!checkoutAvailable) {
      toast.error(
        "Checkout is temporarily unavailable. Please try again later."
      );
      return;
    }

    const ok = await confirm({
      title: "Upgrade to Pro Studio?",
      description:
        "You will be charged monthly in INR. Complete secure checkout to unlock higher stream quality and Pro features.",
      confirmLabel: "Continue to payment",
      cancelLabel: "Not now",
      variant: "default",
    });
    if (!ok) return;

    setBusy("subscribe");
    try {
      const res = await api.createBillingSubscription("PRO");
      const data = res.data;

      await openRazorpayCheckout({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "Castify",
        description: data.description,
        prefill: data.prefill,
        theme: { color: GREEN },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            toast.message("Checkout closed — your plan was not changed.");
            setBusy(null);
          },
        },
        handler: async (response) => {
          try {
            const verified = await api.verifyBillingPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
            });
            setCurrentPlan(verified.data.plan);
            toast.success(
              verified.data.plan === "PRO"
                ? "Pro is active — enjoy higher quality streaming."
                : "Payment received. Your plan will update shortly."
            );
            await refreshUser();
            await load();
          } catch (err: unknown) {
            toast.error(
              userFacingError(
                err,
                "We could not confirm your payment. Please try again or contact support."
              )
            );
          } finally {
            setBusy(null);
          }
        },
      });
    } catch (err: unknown) {
      toast.error(
        userFacingError(
          err,
          "We could not start checkout. Please try again later."
        )
      );
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: "Cancel Pro subscription?",
      description:
        "Your plan stays Pro until the end of the current billing period when applicable. You can resubscribe anytime.",
      confirmLabel: "Cancel subscription",
      cancelLabel: "Keep Pro",
      variant: "destructive",
    });
    if (!ok) return;

    setBusy("cancel");
    try {
      const res = await api.cancelBillingSubscription();
      toast.success(
        res.data.currentEnd
          ? `Cancelled — Pro access until ${formatDate(res.data.currentEnd) ?? "period end"}`
          : "Subscription cancelled"
      );
      setCurrentPlan(res.data.plan);
      await refreshUser();
      await load();
    } catch (err: unknown) {
      toast.error(
        userFacingError(
          err,
          "We could not cancel right now. Please try again later."
        )
      );
    } finally {
      setBusy(null);
    }
  };

  const planLabel =
    currentPlan === "PRO"
      ? "Pro Studio"
      : currentPlan === "ENTERPRISE"
        ? "Enterprise"
        : "Free Node";

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Billing"
        description={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>Manage your plan and subscription. Prices in INR.</span>
            <PlanBadge plan={currentPlan} size="xs" href={null} />
          </span>
        }
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
                {planLabel}
              </h3>
              <Badge className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded border bg-emerald-500/8 text-emerald-400 border-emerald-500/20">
                {statusLabel(subscription?.status, currentPlan)}
              </Badge>
              {subscription?.cancelAtPeriodEnd && (
                <Badge className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25">
                  Cancels end of period
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
              {loading
                ? "Loading plan…"
                : currentPlan === "FREE"
                  ? "You are on the free tier. Upgrade for higher quality and longer retention."
                  : currentPlan === "PRO"
                    ? `Pro is active${
                        formatDate(subscription?.currentEnd)
                          ? ` · period ends ${formatDate(subscription?.currentEnd)}`
                          : ""
                      }.`
                    : "Enterprise is managed with our team."}
            </p>
            {!checkoutAvailable && !loading && currentPlan === "FREE" && (
              <p className="text-[11px] text-muted-foreground">
                Checkout is temporarily unavailable. Please try again later.
              </p>
            )}
          </div>
        </div>
        {currentPlan === "FREE" && (
          <Button
            size="sm"
            className="btn-primary-flat shrink-0 px-4 h-9 gap-1.5 text-xs w-full sm:w-auto"
            onClick={handleSubscribe}
            disabled={!!busy || loading || !checkoutAvailable}
          >
            {busy === "subscribe" ? (
              <RiLoader4Line className="size-3.5 animate-spin" />
            ) : (
              <RiFlashlightLine className="size-3.5" />
            )}
            Upgrade to Pro
          </Button>
        )}
        {isProActive &&
          currentPlan === "PRO" &&
          !subscription?.cancelAtPeriodEnd && (
            <Button
              size="sm"
              variant="secondary"
              className="btn-secondary-flat shrink-0 px-4 h-9 gap-1.5 text-xs w-full sm:w-auto"
              onClick={handleCancel}
              disabled={!!busy || loading}
            >
              {busy === "cancel" ? (
                <RiLoader4Line className="size-3.5 animate-spin" />
              ) : (
                <RiCloseCircleLine className="size-3.5" />
              )}
              Cancel Pro
            </Button>
          )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {(plans.length
          ? plans
          : ([
              {
                tier: "FREE" as const,
                name: "Free Node",
                displayPrice: "₹0",
                period: "forever",
                features: [],
                selfServe: false,
                cta: "Free",
                amountPaise: 0,
                currency: "INR",
                interval: 0,
                razorpayLinked: false,
              },
            ] as BillingPlanPublic[])
        ).map((plan) => {
          const current = plan.tier === currentPlan;
          const accent = ACCENT[plan.tier];
          const periodLabel =
            plan.tier === "FREE"
              ? "forever"
              : plan.tier === "ENTERPRISE"
                ? ""
                : "/ month";

          return (
            <div
              key={plan.tier}
              className="supabase-panel supabase-panel-interactive p-5 sm:p-6 flex flex-col justify-between min-h-0 md:min-h-[400px] relative overflow-hidden"
              style={
                current ? { borderColor: "rgba(62, 207, 142, 0.3)" } : undefined
              }
            >
              {current && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold tracking-tight text-foreground/90">
                    {plan.name}
                  </h4>
                  {current && (
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
                    style={{ color: accent }}
                  >
                    {plan.displayPrice}
                  </span>
                  {periodLabel && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {periodLabel}
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
                {plan.tier === "PRO" && !current && (
                  <Button
                    className="w-full gap-1.5 h-10 sm:h-9 text-xs btn-primary-flat"
                    onClick={handleSubscribe}
                    disabled={!!busy || loading || !checkoutAvailable}
                  >
                    {busy === "subscribe" ? (
                      <RiLoader4Line className="size-4 animate-spin" />
                    ) : (
                      <>
                        {plan.cta}
                        <RiArrowRightLine className="size-4" />
                      </>
                    )}
                  </Button>
                )}
                {plan.tier === "PRO" && current && (
                  <Button
                    className="w-full gap-1.5 h-10 sm:h-9 text-xs btn-secondary-flat"
                    variant="secondary"
                    disabled
                  >
                    Current Plan
                  </Button>
                )}
                {plan.tier === "FREE" && (
                  <Button
                    className="w-full gap-1.5 h-10 sm:h-9 text-xs btn-secondary-flat"
                    variant="secondary"
                    disabled
                  >
                    {current ? "Current Plan" : "Included free"}
                  </Button>
                )}
                {plan.tier === "ENTERPRISE" && (
                  <Button
                    className="w-full gap-1.5 h-10 sm:h-9 text-xs btn-secondary-flat"
                    variant="secondary"
                    asChild
                  >
                    <a href="mailto:hello@castify.dev?subject=Castify%20Enterprise">
                      Contact Us
                      <RiArrowRightLine className="size-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="supabase-panel p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <RiShieldLine className="size-4 text-emerald-400 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Payment history
          </h3>
        </div>

        {subscription?.recentPayments?.length ? (
          <ul className="space-y-2">
            {subscription.recentPayments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 text-xs border border-border/50 rounded-md px-3 py-2"
              >
                <span className="text-muted-foreground">
                  {formatDate(p.createdAt) ?? "—"}
                </span>
                <span className="text-foreground/90 shrink-0 font-medium">
                  {(p.amountPaise / 100).toLocaleString("en-IN", {
                    style: "currency",
                    currency: p.currency || "INR",
                  })}
                  {p.status === "captured" || p.status === "paid"
                    ? " · Paid"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state !py-8 sm:!py-10 space-y-3">
            <div className="flex size-12 items-center justify-center rounded-md bg-muted/20 border border-border mb-1">
              <RiGlobalLine className="size-6 text-muted-foreground/40" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">No payments yet</p>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mx-auto">
                After you upgrade, successful charges will show up here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
