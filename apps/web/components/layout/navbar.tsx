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
  RiCompass3Line,
  RiPlayListLine,
  RiBroadcastLine,
  RiKey2Line,
} from "react-icons/ri";

export function Navbar() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

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

  // Viewer-first primary nav
  const viewerLinks = [
    { label: "Explore", href: "/explore", icon: RiCompass3Line },
    { label: "Library", href: "/library", icon: RiPlayListLine },
    { label: "Join", href: "/library?tab=join", icon: RiKey2Line },
  ];

  // Creator tools only in account menu (not forced on every page)
  const creatorLinks = [
    { label: "Creator Studio", href: "/dashboard", icon: RiDashboardLine },
    { label: "Go live", href: "/dashboard/streams/new", icon: RiBroadcastLine },
  ];

  const accountLinks = [
    { label: "Profile", href: "/dashboard/profile", icon: RiUserLine },
    { label: "Settings", href: "/dashboard/settings", icon: RiSettings3Line },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-[#0c0c0c]/85 backdrop-blur-md border-b border-border/80 safe-px supports-[backdrop-filter]:bg-[#0c0c0c]/70">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-3 sm:px-4">
        <Link
          href={user ? "/explore" : "/"}
          className="group flex items-center gap-2 sm:gap-2.5 font-bold text-base tracking-tight min-w-0 shrink-0"
          aria-label="Castify home"
        >
          <div className="flex size-7 items-center justify-center rounded bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[#3ecf8e] transition-transform duration-200 group-hover:scale-105 shrink-0">
            <RiTvLine className="size-4" />
          </div>
          <span className="tracking-tight text-foreground/90 font-semibold">
            castify
          </span>
        </Link>

        {user && !isLoading && (
          <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center min-w-0">
            {viewerLinks.map((link) => {
              const active =
                link.href === "/explore"
                  ? pathname.startsWith("/explore")
                  : link.href.startsWith("/library")
                  ? pathname.startsWith("/library")
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
                style={{
                  borderColor: menuOpen ? "var(--border)" : "transparent",
                }}
              >
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback className="text-[10px] font-bold bg-[#1a1a1a] text-[#3ecf8e] rounded">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold text-xs truncate">
                  {user.username}
                </span>
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
                  className="absolute right-0 mt-2 w-56 rounded-md p-1 shadow-xl bg-[#141414] border border-border animate-fade-up z-50"
                >
                  <div className="px-3 py-2 text-[10px] truncate text-muted-foreground font-mono">
                    {user.email}
                  </div>
                  <div className="h-px bg-border my-1" />

                  <p className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    Watch
                  </p>
                  {viewerLinks.map((item) => (
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
                  <p className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    Create
                  </p>
                  {creatorLinks.map((item) => (
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
                  {accountLinks.map((item) => (
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
                      setMenuOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-red-400/90 hover:bg-red-500/10 transition-all"
                  >
                    <RiLogoutBoxRLine className="size-4 shrink-0" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="text-xs h-8" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" className="btn-primary-flat text-xs h-8" asChild>
                <Link href="/signup">Join free</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="md:hidden p-2 rounded hover:bg-[#1a1a1a] text-muted-foreground"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <RiCloseLine className="size-5" />
          ) : (
            <RiMenuLine className="size-5" />
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-[#0c0c0c] px-3 py-3 space-y-1 animate-fade-up">
          {user ? (
            <>
              {viewerLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={closeMobile}
                  className="flex items-center gap-2 px-3 py-2.5 rounded text-sm text-foreground/90 hover:bg-[#1a1a1a]"
                >
                  <l.icon className="size-4 text-muted-foreground" />
                  {l.label}
                </Link>
              ))}
              <div className="h-px bg-border my-2" />
              <p className="px-3 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Create
              </p>
              {creatorLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={closeMobile}
                  className="flex items-center gap-2 px-3 py-2.5 rounded text-sm text-muted-foreground hover:bg-[#1a1a1a]"
                >
                  <l.icon className="size-4" />
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  void logout();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 rounded text-sm text-red-400"
              >
                <RiLogoutBoxRLine className="size-4" /> Sign out
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              <Button className="btn-primary-flat w-full" asChild>
                <Link href="/signup" onClick={closeMobile}>
                  Join free
                </Link>
              </Button>
              <Button variant="secondary" className="btn-secondary-flat w-full" asChild>
                <Link href="/login" onClick={closeMobile}>
                  Sign in
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
