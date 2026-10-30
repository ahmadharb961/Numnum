"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BellOff, BellRing, Volume2 } from "lucide-react";
import { playOrderSound, unlockOrderSound } from "./order-sound";

/**
 * Watches for new orders every 10 s while the dashboard is open: rings (loud, repeating until
 * the orders are handled or "Stop ringing" is tapped), vibrates, updates the tab title and
 * refreshes the orders list.
 */
export function NewOrderAlert({ initialCount }: { initialCount: number }) {
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

  return (
    <div className="flex items-center gap-2">
      {count > 0 && (
        <a href="/dashboard/orders" className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">
          <BellRing className="h-4 w-4" /> {count} new order{count === 1 ? "" : "s"}
        </a>
      )}
      {ringing && soundOn && count > 0 && (
        <button onClick={() => setRinging(false)} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white">
          <BellOff className="h-4 w-4" /> Stop ringing
        </button>
      )}
      <button
        onClick={() => {
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
        }}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${soundOn && !needsTap ? "bg-emerald-50 text-emerald-700" : soundOn ? "bg-amber-50 text-amber-800" : "bg-black/5 text-ink-muted"}`}
        aria-pressed={soundOn}
      >
        <Volume2 className="h-4 w-4" /> {soundOn ? (needsTap ? "Tap to enable sound" : "Sound on") : "Turn on sound"}
      </button>
    </div>
  );
}
