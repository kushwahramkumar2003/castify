"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiUserSettingsLine,
  RiKeyLine,
  RiEyeLine,
  RiEyeOffLine,
  RiCameraLine,
  RiLoader4Line,
  RiErrorWarningLine,
} from "react-icons/ri";

const profileSchema = z.object({
  fullName: z.string().max(100).optional().or(z.literal("")),
  bio: z.string().max(300).optional().or(z.literal("")),
  avatarUrl: z
    .string()
    .url("Must be a valid URL")
    .max(500)
    .optional()
    .or(z.literal("")),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Needs uppercase")
    .regex(/[a-z]/, "Needs lowercase")
    .regex(/[0-9]/, "Needs a number")
    .regex(/[@!%*#?&]/, "Needs a special char"),
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user?.username?.[0]?.toUpperCase() ?? "?");

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: user
      ? {
          fullName: user.fullName ?? "",
          bio: user.bio ?? "",
          avatarUrl: user.avatarUrl ?? "",
        }
      : undefined,
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  async function onProfileSubmit(data: ProfileForm) {
    setProfileSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (data.fullName !== (user?.fullName ?? ""))
        payload.fullName = data.fullName ?? "";
      if (data.bio !== (user?.bio ?? "")) payload.bio = data.bio ?? "";
      if (data.avatarUrl !== (user?.avatarUrl ?? ""))
        payload.avatarUrl = data.avatarUrl ?? "";
      if (!Object.keys(payload).length) {
        toast.info("No changes to save");
        return;
      }
      await api.updateMe(payload);
      await refreshUser();
      toast.success("Profile updated");
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Update failed"
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function onPasswordSubmit(data: PasswordForm) {
    setPasswordSaving(true);
    try {
      await api.changePassword(data);
      passwordForm.reset();
      toast.success("Password updated");
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed"
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  if (!user) return null;

  const bioLen = profileForm.watch("bio")?.length ?? 0;

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Settings"
        description="Profile and account security."
      />

      <Tabs defaultValue="profile">
        <TabsList className="bg-[#141414] p-1 rounded-md border border-border w-full sm:max-w-xs grid grid-cols-2 h-auto">
          <TabsTrigger
            value="profile"
            className="px-3 py-2 text-xs font-semibold rounded gap-1.5 data-[state=active]:text-emerald-400"
          >
            <RiUserSettingsLine className="size-3.5" /> Profile
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="px-3 py-2 text-xs font-semibold rounded gap-1.5 data-[state=active]:text-emerald-400"
          >
            <RiKeyLine className="size-3.5" /> Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-3 sm:mt-4 space-y-4">
          <div className="supabase-panel p-4 sm:p-6 space-y-5 sm:space-y-6">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold tracking-tight">Studio Identity</h3>
              <p className="text-xs text-muted-foreground">
                Display name, bio, and avatar for your channel
              </p>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              <Avatar className="size-12 sm:size-14 rounded-lg border border-border shrink-0">
                <AvatarFallback className="rounded-lg text-sm font-bold bg-[#1a1a1a] text-emerald-400">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-semibold text-foreground/90 truncate">
                  {user.fullName ?? user.username}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  @{user.username}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Avatar URL updates after you save
                </p>
              </div>
            </div>

            <Separator className="opacity-30" />

            <form
              onSubmit={profileForm.handleSubmit(onProfileSubmit)}
              className="space-y-4"
              noValidate
            >
              <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="s-email"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Email
                  </Label>
                  <Input
                    id="s-email"
                    value={user.email}
                    disabled
                    className="opacity-50 h-10 text-sm rounded-md bg-[#121212] border border-border"
                  />
                  <p className="text-[10px] text-muted-foreground">Cannot be changed</p>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="s-username"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Username
                  </Label>
                  <Input
                    id="s-username"
                    value={user.username}
                    disabled
                    className="opacity-50 h-10 text-sm rounded-md bg-[#121212] border border-border"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="s-fullName"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Display Name
                </Label>
                <Input
                  id="s-fullName"
                  placeholder="Your display name"
                  className="h-10 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                  {...profileForm.register("fullName")}
                />
                {profileForm.formState.errors.fullName && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <RiErrorWarningLine className="size-3.5" />
                    {profileForm.formState.errors.fullName.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="s-bio"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Short Bio
                  </Label>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      bioLen > 280 ? "text-amber-400" : "text-muted-foreground/60"
                    }`}
                  >
                    {bioLen}/300
                  </span>
                </div>
                <Input
                  id="s-bio"
                  placeholder="Channel bio…"
                  maxLength={300}
                  className="h-10 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                  {...profileForm.register("bio")}
                />
                {profileForm.formState.errors.bio && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <RiErrorWarningLine className="size-3.5" />
                    {profileForm.formState.errors.bio.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="s-avatar"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Avatar Image URL
                </Label>
                <div className="relative">
                  <RiCameraLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8a8a8a]" />
                  <Input
                    id="s-avatar"
                    placeholder="https://…"
                    className="pl-9 h-10 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                    {...profileForm.register("avatarUrl")}
                  />
                </div>
                {profileForm.formState.errors.avatarUrl && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <RiErrorWarningLine className="size-3.5" />
                    {profileForm.formState.errors.avatarUrl.message}
                  </p>
                )}
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={profileSaving}
                  className="btn-primary-flat h-10 sm:h-9 px-4 text-xs gap-2 w-full sm:w-auto"
                >
                  {profileSaving ? (
                    <>
                      <RiLoader4Line className="size-3.5 spin" />
                      Saving…
                    </>
                  ) : (
                    "Save Profile Changes"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-3 sm:mt-4">
          <div className="supabase-panel p-4 sm:p-6 space-y-5 sm:space-y-6">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold tracking-tight">Access Credentials</h3>
              <p className="text-xs text-muted-foreground">
                Change the password used to sign in to Castify
              </p>
            </div>

            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              className="space-y-4 max-w-md"
              noValidate
            >
              <div className="space-y-1.5">
                <Label
                  htmlFor="cur-pw"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Current Password
                </Label>
                <div className="relative">
                  <Input
                    id="cur-pw"
                    type={showCurPw ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-11 h-10 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                    {...passwordForm.register("currentPassword")}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowCurPw((v) => !v)}
                    aria-label={showCurPw ? "Hide password" : "Show password"}
                  >
                    {showCurPw ? (
                      <RiEyeOffLine className="size-4" />
                    ) : (
                      <RiEyeLine className="size-4" />
                    )}
                  </button>
                </div>
                {passwordForm.formState.errors.currentPassword && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <RiErrorWarningLine className="size-3.5" />
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="new-pw"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="new-pw"
                    type={showNewPw ? "text" : "password"}
                    autoComplete="new-password"
                    className="pr-11 h-10 text-sm supabase-input bg-muted/20 border-border focus:border-emerald-500"
                    {...passwordForm.register("newPassword")}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowNewPw((v) => !v)}
                    aria-label={showNewPw ? "Hide password" : "Show password"}
                  >
                    {showNewPw ? (
                      <RiEyeOffLine className="size-4" />
                    ) : (
                      <RiEyeLine className="size-4" />
                    )}
                  </button>
                </div>
                {passwordForm.formState.errors.newPassword && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <RiErrorWarningLine className="size-3.5" />
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={passwordSaving}
                  className="btn-primary-flat h-10 sm:h-9 px-4 text-xs gap-2 w-full sm:w-auto"
                >
                  {passwordSaving ? (
                    <>
                      <RiLoader4Line className="size-3.5 spin" />
                      Updating…
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
