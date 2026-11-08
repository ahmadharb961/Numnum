"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { formatCountdown } from "@/lib/format";
import { useServerClock } from "@/components/server-clock";

type Props = {
  expiresAt: string;
  onExpire?: () => void;
  size?: "sm" | "lg";
  className?: string;
};

export function Countdown({ expiresAt, onExpire, size = "sm", className = "" }: Props) {
  const now = useServerClock();
  const end = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => end - now());
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const ms = end - now();
      setLeft(ms);
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [end, now]);

  const urgent = left < 10 * 60 * 1000;
  const done = left <= 0;
  const sizing = size === "lg" ? "px-3.5 py-2 text-base gap-2" : "px-2.5 py-1 text-[13px] gap-1.5";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-semibold tabular-nums ${sizing} ${
        done ? "bg-ink/5 text-ink-muted" : "bg-coral-soft text-coral"
      } ${className}`}
      role="timer"
      aria-label={done ? "Expired" : `Time left ${formatCountdown(left)}`}
      suppressHydrationWarning
    >
      <Clock className={`${size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"} ${urgent && !done ? "animate-pulse" : ""}`} aria-hidden />
      <span suppressHydrationWarning>{done ? "Expired" : formatCountdown(left)}</span>
    </span>
  );
}
