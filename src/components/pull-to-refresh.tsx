"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { runRefreshSteps } from "@/lib/pull-refresh";
import { useT } from "@/i18n/client";

const THRESHOLD = 72; // px of pull (after resistance) that refreshes on release
const MAX = 110;
// Reel feeds swipe vertically between videos: no pull-to-refresh there.
const SKIP = /^\/($|reel\/|(r|c)\/[^/]+\/reels)/;

/** How far the page is scrolled (the installed app scrolls inside .app-scroll, browsers the page). */
function scrolledTop() {
  const inner = document.querySelector<HTMLElement>(".app-scroll");
  return Math.max(document.scrollingElement?.scrollTop ?? 0, inner?.scrollTop ?? 0);
}

/**
 * Pull the page down from the top to refresh it, like Instagram: a spinner follows the finger,
 * and past the line the screen reloads its data in place (no full reload, what's typed stays).
 */
export function PullToRefresh() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const busyRef = useRef(false);
  const steps = useRef<Promise<unknown> | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    if (SKIP.test(pathname)) return;
    let y0: number | null = null;
    let dist = 0;
    const onStart = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || scrolledTop() > 0) return;
      const el = e.target as Element | null;
      if (el?.closest?.("[role=dialog], [data-no-pull], input, textarea, select, video, .leaflet-container")) return;
      y0 = e.touches[0].clientY;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0 || scrolledTop() > 0) {
        if (dy < 0) y0 = null; // scrolling down the page: not a pull
        if (dist) setPull((dist = 0));
        return;
      }
      dist = Math.min(MAX, dy * 0.5); // resistance, like iOS
      setPull(dist);
    };
    const onEnd = () => {
      if (y0 === null) return;
      y0 = null;
      if (dist >= THRESHOLD) {
        busyRef.current = true;
        setBusy(true);
        setPull(THRESHOLD);
        startedAt.current = Date.now();
        steps.current = runRefreshSteps();
        start(() => router.refresh());
      } else setPull(0);
      dist = 0;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pathname, router]);

  // Moved to another screen while refreshing (that cancels the refresh): stop the spinner there.
  const shownOn = useRef(pathname);
  useEffect(() => {
    if (shownOn.current === pathname) return;
    shownOn.current = pathname;
    if (!busyRef.current) return;
    busyRef.current = false;
    setBusy(false);
    setPull(0);
  }, [pathname]);

  // Never spin forever: if the page's refresh is cut short (another navigation took over), stop anyway.
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => {
      busyRef.current = false;
      setBusy(false);
      setPull(0);
    }, 6000);
    return () => clearTimeout(t);
  }, [busy]);

  // The refreshed page arrived from the server: done (Next doesn't always report the refresh as
  // finished, so this, not only `pending`, ends the spinner).
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!busy) return setArrived(false);
    const on = () => setArrived(true);
    window.addEventListener("nn:refreshed", on);
    return () => window.removeEventListener("nn:refreshed", on);
  }, [busy]);

  // Done once the page and every registered step have reloaded (shown at least a moment).
  useEffect(() => {
    if (!busy || (pending && !arrived)) return;
    let live = true;
    void Promise.resolve(steps.current).then(() => {
      const wait = Math.max(0, 450 - (Date.now() - startedAt.current));
      setTimeout(() => {
        if (!live) return;
        busyRef.current = false;
        setBusy(false);
        setPull(0);
      }, wait);
    });
    return () => {
      live = false;
    };
  }, [busy, pending, arrived]);

  if (!pull && !busy) return null;
  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center" style={{ paddingTop: "var(--safe-top)" }} role="status" aria-live="polite" data-testid="pull-refresh">
      <div
        className="mt-2 grid h-10 w-10 place-items-center rounded-full bg-white text-brand-500 shadow-lg ring-1 ring-black/5 transition-transform duration-150"
        style={{ transform: `translateY(${pull - 20}px) scale(${0.6 + 0.4 * progress})`, opacity: busy ? 1 : progress }}
      >
        <RotateCw className={busy ? "h-5 w-5 animate-spin" : "h-5 w-5"} style={busy ? undefined : { transform: `rotate(${progress * 270}deg)` }} aria-label={busy ? t("Refreshing…") : undefined} />
      </div>
    </div>
  );
}
