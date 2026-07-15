"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  RiTvLine,
  RiDashboardLine,
  RiSettings3Line,
  RiLogoutBoxRLine,
  RiMenuLine,
  RiCloseLine,
  RiArrowDownSLine,
  RiUserLine,
  RiVideoLine,
  RiCompass3Line,
} from "react-icons/ri";

export function Navbar() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  // Auto-close on route change
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  // Escape closes menus; lock body scroll when mobile open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user?.username?.[0]?.toUpperCase() ?? "?");

  const navLinks = user
    ? [
        { icon: RiCompass3Line, label: "Explore", href: "/explore" },
        { icon: RiDashboardLine, label: "Studio Dashboard", href: "/dashboard" },
        { icon: RiVideoLine, label: "My Streams", href: "/dashboard/streams" },
        { icon: RiUserLine, label: "Profile", href: "/dashboard/profile" },
        { icon: RiSettings3Line, label: "Settings", href: "/dashboard/settings" },
      ]
    : [];

  return (
    <nav
      className="sticky top-0 z-50 bg-[#0c0c0c]/85 backdrop-blur-md border-b border-border/80 safe-px supports-[backdrop-filter]:bg-[#0c0c0c]/70"
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-3 sm:px-4">
        {/* Logo */}
        <Link
          href="/"
          className="group flex items-center gap-2 sm:gap-2.5 font-bold text-base tracking-tight min-w-0 shrink-0"
          aria-label="Castify home"
        >
          <div className="flex size-7 items-center justify-center rounded bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[#3ecf8e] transition-transform duration-200 group-hover:scale-105 shrink-0">
            <RiTvLine className="size-4" />
          </div>
          <span className="tracking-tight text-foreground/90 font-semibold">castify</span>
        </Link>

        {/* Desktop center links (signed-in) */}
        {user && !isLoading && (
          <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center min-w-0">
            {[
              { label: "Explore", href: "/explore" },
              { label: "Studio", href: "/dashboard" },
              { label: "My streams", href: "/dashboard/streams" },
              { label: "Recordings", href: "/dashboard/recordings" },
            ].map((link) => {
              const active =
                link.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                    active
                      ? "text-emerald-400 bg-emerald-500/8"
                      : "text-muted-foreground hover:text-foreground hover:bg-[#1a1a1a]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}

        {/* Desktop nav actions */}
        <div className="hidden items-center gap-2 md:flex shrink-0">
          {isLoading ? (
            <div className="h-8 w-24 rounded bg-white/5 animate-pulse" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded px-2.5 py-1.5 transition-all duration-150 hover:bg-[#1a1a1a] text-sm text-foreground/80 hover:text-foreground border border-transparent max-w-[200px]"
                style={{ borderColor: menuOpen ? "var(--border)" : "transparent" }}
              >
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback className="text-[10px] font-bold bg-[#1a1a1a] text-[#3ecf8e] rounded">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold text-xs truncate">{user.username}</span>
                <RiArrowDownSLine
                  className="size-4 transition-transform text-muted-foreground shrink-0"
                  style={{
                    transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-52 rounded-md p-1 shadow-xl bg-[#141414] border border-border animate-fade-up z-50"
                >
                  <div className="px-3 py-2 text-[10px] truncate text-muted-foreground font-mono">
                    {user.email}
                  </div>
                  <div className="h-px bg-border my-1" />

                  {navLinks.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        router.push(item.href);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-[#a0a0a0] hover:text-foreground hover:bg-[#1a1a1a] transition-all"
                    >
                      <item.icon className="size-4 text-muted-foreground shrink-0" />
                      {item.label}
                    </button>
                  ))}

                  <div className="h-px bg-border my-1" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <RiLogoutBoxRLine className="size-4" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/login")}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-[#1a1a1a] h-8 px-3"
              >
                Sign in
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/signup")}
                className="btn-primary-flat text-xs font-semibold h-8 px-4"
              >
                Get started
              </Button>
            </div>
          )}
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          className="md:hidden flex items-center justify-center size-10 -mr-1 rounded-md hover:bg-[#1a1a1a] text-muted-foreground hover:text-foreground transition-colors touch-target"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <RiCloseLine className="size-5" /> : <RiMenuLine className="size-5" />}
        </button>
      </div>

      {/* Mobile menu overlay + panel */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="md:hidden fixed inset-0 top-14 z-40 bg-black/50 backdrop-blur-[2px] animate-fade-in"
            aria-label="Close menu overlay"
            onClick={closeMobile}
          />
          <div
            ref={mobilePanelRef}
            className="md:hidden absolute left-0 right-0 top-full z-50 border-b border-border/60 bg-[#0c0c0c] shadow-2xl animate-fade-up safe-pb max-h-[min(70vh,calc(100dvh-3.5rem))] overflow-y-auto"
          >
            <div className="px-3 sm:px-4 py-3 space-y-1">
              {isLoading ? (
                <div className="h-10 rounded bg-white/5 animate-pulse" />
              ) : user ? (
                <>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#141414] border border-border/50 mb-2">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="text-xs font-bold bg-[#1a1a1a] text-[#3ecf8e] rounded">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{user.username}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  {navLinks.map((item) => {
                    const active =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href);
                    return (
                      <button
                        key={item.href}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors min-h-[44px] ${
                          active
                            ? "bg-emerald-500/10 text-emerald-400 font-semibold"
                            : "text-foreground/85 hover:bg-[#1a1a1a]"
                        }`}
                        onClick={() => {
                          router.push(item.href);
                          closeMobile();
                        }}
                      >
                        <item.icon
                          className={`size-4 shrink-0 ${
                            active ? "text-emerald-400" : "text-muted-foreground"
                          }`}
                        />
                        {item.label}
                      </button>
                    );
                  })}

                  <div className="h-px bg-border my-2" />

                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-destructive hover:bg-destructive/10 min-h-[44px]"
                    onClick={() => {
                      logout();
                      closeMobile();
                    }}
                  >
                    <RiLogoutBoxRLine className="size-4" /> Log out
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 pt-1 pb-2">
                  <Button
                    variant="secondary"
                    className="w-full btn-secondary-flat text-sm h-11"
                    onClick={() => {
                      router.push("/login");
                      closeMobile();
                    }}
                  >
                    Sign in
                  </Button>
                  <Button
                    className="w-full btn-primary-flat text-sm h-11"
                    onClick={() => {
                      router.push("/signup");
                      closeMobile();
                    }}
                  >
                    Get started
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
