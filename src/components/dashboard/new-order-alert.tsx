"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { BellOff, BellRing, Volume2, VolumeX } from "lucide-react";
import { playOrderSound, unlockOrderSound } from "./order-sound";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Watches for new orders every 10 s while the dashboard is open: rings (loud, repeating until
 * the orders are handled or "Stop ringing" is tapped), vibrates, updates the tab title and
 * refreshes the orders list. One watcher for the whole dashboard; the phone's top bar, the
 * computer's top row and the Orders tab badge all read from it.
 */
type Alerts = {
  count: number;
  soundOn: boolean;
  needsTap: boolean;
  ringing: boolean;
  toggleSound: () => void;
  stopRinging: () => void;
};
const Ctx = createContext<Alerts | null>(null);
export const useOrderAlerts = () => useContext(Ctx);

export function OrderAlertsProvider({ initialCount, children }: { initialCount: number; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const known = useRef<Set<string> | null>(null);
  const [count, setCount] = useState(initialCount);
  const [soundOn, setSoundOn] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem("nn_order_sound") === "1");
    } catch {}
  }, []);

  // Phones only allow sound after a tap on the page: unlock audio on the first tap after a reload.
  useEffect(() => {
    if (!soundOn) return;
    const unlock = () => {
      unlockOrderSound();
      setNeedsTap(false);
    };
    const events = ["touchend", "click", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock, { capture: true }));
  }, [soundOn]);

  // Ring now and every 6 s while new orders are waiting.
  useEffect(() => {
    if (!ringing || !soundOn || count === 0) {
      if (count === 0) setRinging(false);
      return;
    }
    const ring = () => {
      void playOrderSound().then((ok) => !ok && setNeedsTap(true));
      navigator.vibrate?.([400, 150, 400, 150, 400]);
    };
    ring();
    const t = setInterval(ring, 6000);
    return () => clearInterval(t);
  }, [ringing, soundOn, count]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = count ? `(${count}) ${base}` : base;
  }, [count, pathname]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/dashboard/new-orders", { cache: "no-store" });
        if (!r.ok) return;
        const { count: c, ids } = (await r.json()) as { count: number; ids: string[] };
        if (stop) return;
        const fresh = known.current ? ids.filter((id) => !known.current!.has(id)) : [];
        known.current = new Set(ids);
        setCount(c);
        if (fresh.length) {
          setRinging(true);
          if (!soundOn) navigator.vibrate?.([400, 150, 400]);
          router.refresh();
        }
      } catch {}
    };
    void tick();
    const t = setInterval(tick, 10000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [router, soundOn]);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem("nn_order_sound", next ? "1" : "0");
    } catch {}
    if (next) {
      unlockOrderSound(); // inside the tap, as phones require
      setNeedsTap(false);
      void playOrderSound(); // test ring
    } else setRinging(false);
  }, [soundOn]);
  const stopRinging = useCallback(() => setRinging(false), []);

  return <Ctx.Provider value={{ count, soundOn, needsTap, ringing, toggleSound, stopRinging }}>{children}</Ctx.Provider>;
}

/** Computer: the full row (new orders, stop ringing, sound) above the page. */
export function NewOrderAlert() {
  const t = useT();
  const a = useOrderAlerts();
  if (!a) return null;
  const { count, soundOn, needsTap, ringing, toggleSound, stopRinging } = a;
  return (
    <div className="flex items-center gap-2">
      {count > 0 && (
        <Link href="/dashboard/orders" className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">
          <BellRing className="h-4 w-4" /> {t(count === 1 ? "{n} new order" : "{n} new orders", { n: count })}
        </Link>
      )}
      {ringing && soundOn && count > 0 && (
        <button onClick={stopRinging} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white">
          <BellOff className="h-4 w-4" /> {t("Stop ringing")}
        </button>
      )}
      <button
        onClick={toggleSound}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${soundOn && !needsTap ? "bg-emerald-50 text-emerald-700" : soundOn ? "bg-amber-50 text-amber-800" : "bg-black/5 text-ink-muted"}`}
        aria-pressed={soundOn}
      >
        <Volume2 className="h-4 w-4" /> {t(soundOn ? (needsTap ? "Tap to enable sound" : "Sound on") : "Turn on sound")}
      </button>
    </div>
  );
}

/** Phone top bar: a sound switch and, while it rings, a big "Stop" (the count is on the Orders tab). */
export function NewOrderAlertCompact() {
  const t = useT();
  const a = useOrderAlerts();
  if (!a) return null;
  const { count, soundOn, needsTap, ringing, toggleSound, stopRinging } = a;
  return (
    <div className="flex items-center gap-1">
      {ringing && soundOn && count > 0 && (
        <button onClick={stopRinging} className="inline-flex h-9 items-center gap-1 rounded-full bg-ink px-3 text-xs font-bold text-white active:scale-95" data-testid="stop-ringing">
          <BellOff className="h-4 w-4" /> {t("Stop")}
        </button>
      )}
      <button
        onClick={toggleSound}
        className={cn("grid h-10 w-10 place-items-center rounded-full transition active:scale-90", soundOn && !needsTap ? "text-emerald-600" : soundOn ? "bg-amber-50 text-amber-700" : "text-ink-muted")}
        aria-pressed={soundOn}
        aria-label={t(soundOn ? (needsTap ? "Tap to enable sound" : "Sound on") : "Turn on sound")}
        title={t(soundOn ? (needsTap ? "Tap to enable sound" : "Sound on") : "Turn on sound")}
        data-testid="sound-toggle"
      >
        {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>
    </div>
  );
}
