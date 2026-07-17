"use client";

import { RiVideoLine, RiLiveLine } from "react-icons/ri";

/** Thumbnail or branded placeholder for stream / VOD cards */
export function StreamCardMedia({
  thumbnailUrl,
  isLive,
  title,
}: {
  thumbnailUrl?: string | null;
  isLive?: boolean;
  title?: string | null;
}) {
  return (
    <div className="relative w-full aspect-video rounded-md overflow-hidden bg-[#121212] border border-border/60">
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={title || "Stream cover"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <RiVideoLine className="size-7 text-muted-foreground/40" />
          <span className="text-[9px] font-mono text-muted-foreground/50">
            No cover
          </span>
        </div>
      )}
      {isLive && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/90 text-white">
          <RiLiveLine className="size-3" /> LIVE
        </span>
      )}
    </div>
  );
}
