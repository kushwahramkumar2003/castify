/** Minimal types for Razorpay Standard Checkout (browser). */

export type RazorpayCheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

export type RazorpayCheckoutOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (response: RazorpayCheckoutResponse) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
  };
};

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => {
  open: () => void;
  on: (event: string, cb: (resp: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loading: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout is only available in the browser"));
  }
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Checkout is temporarily unavailable. Please try again."))
      );
      if (window.Razorpay) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(
        new Error("Checkout is temporarily unavailable. Please try again.")
      );
    };
    document.body.appendChild(script);
  });

  return loading;
}

export async function openRazorpayCheckout(
  options: RazorpayCheckoutOptions
): Promise<void> {
  await loadRazorpayScript();
  if (!window.Razorpay) {
    throw new Error("Checkout is temporarily unavailable. Please try again.");
  }
  const rzp = new window.Razorpay(options);
  rzp.open();
}
