"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { subscribeFeed } from "@/lib/realtime";
import { LiveDot } from "@/components/live-dot";

/** Small "● 12 live" pill for the header. */
export function LiveCount({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    let timer: number | undefined;
    const refresh = async () => {
      const { count: c } = await getBrowserClient()
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      if (typeof c === "number") setCount(c);
    };
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 600);
    };
    const unsubscribe = subscribeFeed(debounced);
    const poll = window.setInterval(refresh, 60_000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
      <LiveDot />
      <span className="tabular-nums">{count}</span> live
    </span>
  );
}
