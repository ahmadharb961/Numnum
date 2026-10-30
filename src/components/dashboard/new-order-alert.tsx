"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BellRing, Volume2 } from "lucide-react";

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
  } catch {}
}

/**
 * Watches for new orders every 15 s while the dashboard is open: plays a sound,
 * vibrates, updates the tab title and refreshes the orders list.
 */
export function NewOrderAlert({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const known = useRef<Set<string> | null>(null);
  const [count, setCount] = useState(initialCount);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem("nn_order_sound") === "1");
    } catch {}
  }, []);

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
          if (soundOn) beep();
          navigator.vibrate?.([200, 100, 200]);
          router.refresh();
        }
      } catch {}
    };
    void tick();
    const t = setInterval(tick, 15000);
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
      <button
        onClick={() => {
          const next = !soundOn;
          setSoundOn(next);
          try {
            localStorage.setItem("nn_order_sound", next ? "1" : "0");
          } catch {}
          if (next) beep(); // also unlocks audio on iOS (needs a tap)
        }}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${soundOn ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-ink-muted"}`}
        aria-pressed={soundOn}
      >
        <Volume2 className="h-4 w-4" /> {soundOn ? "Sound on" : "Turn on sound"}
      </button>
    </div>
  );
}
