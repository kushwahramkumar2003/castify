"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/layout/navbar";

/**
 * Renders the global shell. Dashboard routes get a full-screen layout
 * (the sidebar is injected by the dashboard's own layout.tsx). All other
 * routes get the top navbar + centered max-width container.
 */
export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <AuthProvider>
        <ShellInner>{children}</ShellInner>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </TooltipProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");

  if (isDashboard) {
    // Full viewport — the sidebar layout takes over completely
    return <div className="h-svh overflow-hidden">{children}</div>;
  }

  return (
    <>
      <Navbar />
      <main className="relative mx-auto max-w-5xl px-3 sm:px-4 py-5 sm:py-8 z-10 safe-px safe-pb">
        {children}
      </main>
    </>
  );
}
