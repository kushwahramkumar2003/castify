"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import {
  RiTvLine,
  RiEyeLine,
  RiEyeOffLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiErrorWarningLine,
} from "react-icons/ri";

const signupSchema = z.object({
  username: z
    .string()
    .min(3, "At least 3 characters")
    .max(30, "At most 30 characters")
    .regex(/^[a-zA-Z]/, "Must start with a letter")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, underscores"),
  fullName: z.string().min(1, "Full name is required").max(100),
  email: z.string().min(1, "Required").email("Invalid email"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Needs an uppercase letter")
    .regex(/[a-z]/, "Needs a lowercase letter")
    .regex(/[0-9]/, "Needs a number")
    .regex(/[@!%*#?&]/, "Needs a special char (@!%*#?&)"),
});
type SignupForm = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupForm>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(data: SignupForm) {
    setIsSubmitting(true);
    try {
      await signup(data);
      router.push("/explore");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Signup failed. Please try again.";
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

      <div className="relative z-10 w-full max-w-[440px] animate-fade-up">
        <div className="supabase-panel px-5 py-7 sm:px-8 sm:py-9 shadow-2xl">
          <div className="mb-6 sm:mb-7 flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-[0_0_24px_rgba(62,207,142,0.12)]">
              <RiTvLine className="size-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Create your account</h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Join Castify and start streaming
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 sm:space-y-4" noValidate>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="username"
                  className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Username
                </label>
                <Input
                  id="username"
                  placeholder="johndoe"
                  autoComplete="username"
                  className="h-11 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                  aria-invalid={!!errors.username}
                  {...register("username")}
                />
                {errors.username && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <RiErrorWarningLine className="size-3.5 shrink-0" />
                    {errors.username.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="fullName"
                  className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Full Name
                </label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  className="h-11 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                  aria-invalid={!!errors.fullName}
                  {...register("fullName")}
                />
                {errors.fullName && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <RiErrorWarningLine className="size-3.5 shrink-0" />
                    {errors.fullName.message}
                  </p>
                )}
              </div>
            </div>

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
                htmlFor="signup-password"
                className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type={showPw ? "text" : "password"}
                  placeholder="Min 8 chars · upper · number · symbol"
                  autoComplete="new-password"
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
              id="signup-submit-btn"
              type="submit"
              className="btn-primary-flat w-full h-11 gap-2 font-semibold text-sm mt-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="size-4 spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account <RiArrowRightLine className="size-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs sm:text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-emerald-400 hover:text-emerald-300 hover:underline underline-offset-4 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
