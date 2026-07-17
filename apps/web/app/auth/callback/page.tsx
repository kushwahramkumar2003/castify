"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { RiLoader4Line } from "react-icons/ri";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [msg, setMsg] = useState("Completing sign-in…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nextRaw = searchParams.get("next") || "/library";
      const next =
        nextRaw.startsWith("/") && !nextRaw.startsWith("//")
          ? nextRaw
          : "/library";
      try {
        await refreshUser();
        if (!cancelled) router.replace(next);
      } catch {
        if (!cancelled) {
          setMsg("Session not ready — redirecting to login…");
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams, refreshUser]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
      <RiLoader4Line className="size-8 text-emerald-400 spin" />
      <p className="text-xs text-muted-foreground">{msg}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
