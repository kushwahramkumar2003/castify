"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RiMenuFoldLine,
  RiMenuUnfoldLine,
  RiMenuLine,
  RiNotification3Line,
  RiSearchLine,
} from "react-icons/ri";

// Page title map
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Studio",
  "/dashboard/analytics": "Studio",
  "/dashboard/streams": "Studio",
  "/dashboard/streams/new": "Studio",
  "/dashboard/recordings": "Studio",
  "/dashboard/crm": "Management",
  "/dashboard/stream-keys": "Management",
  "/dashboard/profile": "Management",
  "/dashboard/settings": "Management",
  "/dashboard/billing": "Management",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Default collapse on tablet widths once known
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 768 && window.innerWidth < 1024) {
      setCollapsed(true);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#121212]">
        <div className="space-y-3 w-48">
          <Skeleton className="h-3 w-full bg-[#242424]" />
          <Skeleton className="h-3 w-5/6 bg-[#242424]" />
          <Skeleton className="h-3 w-2/3 bg-[#242424]" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const pageTitle =
    PAGE_TITLES[pathname] ??
    (pathname.startsWith("/dashboard/streams/") ? "Stream Studio" : "Dashboard");

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-[#121212] text-[#ededed]">
      {/* Desktop / tablet sidebar */}
      {!isMobile && (
        <DashboardSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
        />
      )}

      {/* Mobile nav — only mount when open so closed sheet never leaks chrome */}
      {isMobile && mobileNavOpen && (
        <Sheet open onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            showCloseButton
            className="w-[min(280px,88vw)] max-w-[280px] p-0 gap-0 border-r border-[#242424] bg-[#141414] [&>button]:z-10"
          >
            <SheetTitle className="sr-only">Studio navigation</SheetTitle>
            <div className="h-full overflow-hidden">
              <DashboardSidebar
                collapsed={false}
                onToggle={() => setMobileNavOpen(false)}
                mobile
                onNavigate={() => setMobileNavOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 sm:h-14 shrink-0 items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 bg-[#121212] border-b border-[#242424] safe-px">
          {/* Mobile menu / desktop collapse */}
          {isMobile ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-[#8a8a8a] hover:text-[#ededed] hover:bg-[#1a1a1a] shrink-0"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <RiMenuLine className="size-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-[#8a8a8a] hover:text-[#ededed] hover:bg-[#1a1a1a] shrink-0"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <RiMenuUnfoldLine className="size-4" />
              ) : (
                <RiMenuFoldLine className="size-4" />
              )}
            </Button>
          )}

          {/* Quiet context label — page H1 lives in content */}
          <div className="flex items-center min-w-0 flex-1">
            <span className="text-[11px] font-medium tracking-wide text-[#5c5c5c] truncate">
              {pageTitle}
            </span>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 sm:size-8 text-[#8a8a8a] hover:text-[#ededed] hover:bg-[#1a1a1a] hidden xs:inline-flex"
              aria-label="Search"
            >
              <RiSearchLine className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-[#8a8a8a] hover:text-[#ededed] hover:bg-[#1a1a1a] relative"
              aria-label="Notifications"
            >
              <RiNotification3Line className="size-4" />
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-dot-grid overscroll-contain">
          <div className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-6 md:px-6 md:py-8 safe-px safe-pb">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
