export default function StreamStudioLoading() {
  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <div className="flex items-center gap-3 pb-3 border-b border-border/40">
        <div className="size-9 rounded-md bg-[#1a1a1a] animate-pulse shrink-0" />
        <div className="space-y-2 flex-1 min-w-0">
          <div className="h-5 w-40 sm:w-48 max-w-full rounded bg-[#1a1a1a] animate-pulse" />
          <div className="h-3 w-full max-w-xs rounded bg-[#1a1a1a] animate-pulse" />
        </div>
      </div>
      <div className="supabase-panel p-12 sm:p-16 flex flex-col items-center justify-center text-center gap-3 min-h-[240px]">
        <div className="size-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
        <p className="text-xs text-muted-foreground">Opening stream studio…</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="supabase-panel p-4 h-16 animate-pulse bg-[#141414]" />
        ))}
      </div>
    </div>
  );
}
