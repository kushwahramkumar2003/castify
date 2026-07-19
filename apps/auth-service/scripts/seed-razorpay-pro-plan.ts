/**
 * One-shot: create Razorpay PRO plan (test/live keys from env) and upsert BillingPlan.
 *
 *   cd apps/auth-service && bun run scripts/seed-razorpay-pro-plan.ts
 *
 * Requires: DATABASE_URL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 */
import { ensureProBillingPlan } from "../src/billing/ensureProPlan";
import { isRazorpayConfigured } from "../src/billing/razorpay";

async function main() {
  if (!isRazorpayConfigured()) {
    console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first.");
    process.exit(1);
  }
  const plan = await ensureProBillingPlan();
  if (!plan) {
    console.error("Failed to ensure PRO plan");
    process.exit(1);
  }
  console.log("PRO BillingPlan ready:");
  console.log({
    id: plan.id,
    tier: plan.tier,
    razorpayPlanId: plan.razorpayPlanId,
    amountPaise: plan.amountPaise,
    currency: plan.currency,
  });
  console.log(
    "\nOptional: set RAZORPAY_PRO_PLAN_ID=" +
      plan.razorpayPlanId +
      " in .env to skip re-create."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
