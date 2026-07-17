"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RiGoogleFill, RiCodeBoxLine } from "react-icons/ri";

type Provider = { id: string; label: string; enabled: boolean };

export function OAuthButtons({ next = "/library" }: { next?: string }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .getOAuthProviders()
      .then((r) => setProviders(r.data?.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setLoaded(true));
  }, []);

  const enabled = providers.filter((p) => p.enabled);
  if (!loaded || enabled.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="relative flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Or continue with
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {enabled.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="secondary"
          className="btn-secondary-flat w-full h-11 gap-2 text-sm font-semibold"
          onClick={() => {
            window.location.href = api.oauthStartUrl(p.id, next);
          }}
        >
          {p.id === "google" ? (
            <RiGoogleFill className="size-4 text-[#ea4335]" />
          ) : (
            <RiCodeBoxLine className="size-4 text-emerald-400" />
          )}
          {p.label}
        </Button>
      ))}
    </div>
  );
}
