"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Gates viewer routes — unauthenticated users are sent to login
 * with a return path. Streams are never public without an account.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      const next = encodeURIComponent(pathname || "/explore");
      router.replace(`/login?next=${next}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-up py-10 max-w-md mx-auto">
        <Skeleton className="h-4 w-2/3 bg-[#242424]" />
        <Skeleton className="h-4 w-full bg-[#242424]" />
        <Skeleton className="h-32 w-full bg-[#242424] rounded-lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-16 text-center space-y-2 animate-fade-up">
        <p className="text-sm font-semibold">Sign in required</p>
        <p className="text-xs text-muted-foreground">
          Create a free account or log in to watch streams.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
