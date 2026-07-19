/**
 * Safe Razorpay diagnostics — never prints secret values.
 *   bun run scripts/diagnose-razorpay.ts
 */
import { config } from "../src/config";

function meta(name: string, v: string | undefined) {
  if (v == null || v === "") {
    return { name, set: false };
  }
  const trimmed = v.trim().replace(/^["']|["']$/g, "");
  return {
    name,
    set: true,
    length: v.length,
    trimmedLength: trimmed.length,
    hasLeadingTrailingWhitespace: v !== v.trim(),
    hasSurroundingQuotes: /^["']/.test(v.trim()) || /["']$/.test(v.trim()),
    hasNewline: /[\r\n]/.test(v),
    prefix: trimmed.slice(0, 10),
    looksLikeTestKeyId: trimmed.startsWith("rzp_test_"),
    looksLikeLiveKeyId: trimmed.startsWith("rzp_live_"),
  };
}

async function probe(path: string, keyId: string, keySecret: string) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let description: string | undefined;
  try {
    const j = JSON.parse(text) as {
      error?: { description?: string; code?: string };
    };
    description = j.error?.description || j.error?.code;
  } catch {
    description = text.slice(0, 120);
  }
  return { status: res.status, description };
}

async function main() {
  console.log("cwd:", process.cwd());
  console.log(
    JSON.stringify(
      {
        KEY_ID: meta("KEY_ID", config.RAZORPAY_KEY_ID),
        KEY_SECRET: {
          set: !!config.RAZORPAY_KEY_SECRET,
          length: config.RAZORPAY_KEY_SECRET?.length ?? 0,
          hasWhitespace:
            !!config.RAZORPAY_KEY_SECRET &&
            config.RAZORPAY_KEY_SECRET !== config.RAZORPAY_KEY_SECRET.trim(),
        },
        PRO_PLAN_ID: meta("PRO_PLAN_ID", config.RAZORPAY_PRO_PLAN_ID),
        WEBHOOK_SECRET_set: !!config.RAZORPAY_WEBHOOK_SECRET,
        currency: config.BILLING_CURRENCY,
        amountPaise: config.BILLING_PRO_AMOUNT_PAISE,
      },
      null,
      2
    )
  );

  const keyId = config.RAZORPAY_KEY_ID?.trim().replace(/^["']|["']$/g, "");
  const keySecret = config.RAZORPAY_KEY_SECRET?.trim().replace(
    /^["']|["']$/g,
    ""
  );

  if (!keyId || !keySecret) {
    console.log("Missing KEY_ID or KEY_SECRET — cannot probe API.");
    process.exit(1);
  }

  console.log("\nProbing Razorpay API (Basic auth)…");
  const orders = await probe("/orders?count=1", keyId, keySecret);
  console.log("GET /v1/orders:", orders);
  const plans = await probe("/plans?count=1", keyId, keySecret);
  console.log("GET /v1/plans:", plans);

  if (orders.status === 401) {
    console.log(`
→ 401 on /orders means Key ID + Secret are rejected by Razorpay.
  Fixes:
  1. Dashboard → Test Mode ON → regenerate API keys
  2. Put the NEW pair only in apps/auth-service/.env (or monorepo root if that's what you load)
  3. No quotes/spaces: RAZORPAY_KEY_ID=rzp_test_xxx
  4. Restart auth-service after editing .env
  5. api-gateway does NOT need Razorpay keys (billing hits auth-service directly)
`);
  } else if (plans.status === 401 && orders.status === 200) {
    console.log(
      "→ Keys work for Orders but not Plans — enable Subscriptions on the Razorpay account."
    );
  } else if (orders.status === 200) {
    console.log("→ Keys are valid. Prefer setting RAZORPAY_PRO_PLAN_ID=plan_xxx from Dashboard.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
