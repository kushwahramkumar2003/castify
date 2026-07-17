"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState, Suspense } from "react";
import {
  RiTvLine,
  RiEyeLine,
  RiEyeOffLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiErrorWarningLine,
} from "react-icons/ri";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof loginSchema>;

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/library";
  const oauthError = searchParams.get("error");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginForm) {
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
      router.push(safeNext);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Login failed. Please try again.";
      toast.error(msg);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-1 py-8 sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-72 w-72 sm:h-96 sm:w-96 rounded-full blur-3xl"
        style={{ background: "rgba(62, 207, 142, 0.08)" }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-[420px] animate-fade-up">
        <div className="supabase-panel px-5 py-7 sm:px-8 sm:py-9 shadow-2xl">
          <div className="mb-7 sm:mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-[0_0_24px_rgba(62,207,142,0.12)]">
              <RiTvLine className="size-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Welcome back</h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Sign in to watch, join streams, or open Studio
              </p>
            </div>
          </div>

          {oauthError && (
            <div className="mb-4 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
              {oauthError}
            </div>
          )}

          <OAuthButtons next={safeNext} />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5 mt-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="h-11 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p className="flex items-center gap-1 text-[11px] text-destructive">
                  <RiErrorWarningLine className="size-3.5 shrink-0" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-11 pr-11 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="flex items-center gap-1 text-[11px] text-destructive">
                  <RiErrorWarningLine className="size-3.5 shrink-0" />
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              id="login-submit-btn"
              type="submit"
              className="btn-primary-flat w-full h-11 gap-2 font-semibold text-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="size-4 spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in <RiArrowRightLine className="size-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs sm:text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-emerald-400 hover:text-emerald-300 hover:underline underline-offset-4 transition-colors"
            >
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}
