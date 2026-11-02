"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * One horizontal row that scrolls sideways: swipe on phones; on desktop, round arrow buttons
 * appear at the edges when there's more to see (right-to-left aware).
 */
export function ScrollRow({ children, className }: { children: React.ReactNode; className?: string }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // negative in right-to-left layouts
    setEdge({ start: pos <= 2, end: pos >= max - 2 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrow = (dir: 1 | -1, hidden: boolean) => (
    <button
      type="button"
      onClick={() => go(dir)}
      aria-label={dir === 1 ? t("Show more") : t("Back")}
      tabIndex={hidden ? -1 : 0}
      className={cn(
        "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgba(22,18,15,0.18)] ring-1 ring-black/5 transition hover:scale-105 lg:grid",
        dir === 1 ? "end-0" : "start-0",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      {dir === 1 ? <ChevronRight className="h-5 w-5 rtl:-scale-x-100" /> : <ChevronLeft className="h-5 w-5 rtl:-scale-x-100" />}
    </button>
  );

  return (
    <div className="relative">
      {arrow(-1, edge.start)}
      <div ref={ref} onScroll={update} className={cn("no-scrollbar flex overflow-x-auto scroll-smooth", className)} data-testid="scroll-row">
        {children}
      </div>
      {arrow(1, edge.end)}
      {/* soft fade at the edges that still have more */}
      <div className={cn("pointer-events-none absolute inset-y-0 start-0 hidden w-10 bg-gradient-to-r from-cream to-transparent transition-opacity rtl:bg-gradient-to-l lg:block", edge.start && "opacity-0")} />
      <div className={cn("pointer-events-none absolute inset-y-0 end-0 hidden w-10 bg-gradient-to-l from-cream to-transparent transition-opacity rtl:bg-gradient-to-r lg:block", edge.end && "opacity-0")} />
    </div>
  );
}
