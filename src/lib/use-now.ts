"use client";

import { useSyncExternalStore } from "react";

// One shared clock for every component that shows "N min ago": ticks every 30 s while subscribed.
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The current time, or null while the page is hydrating. Relative times ("3 min ago") must not be
 * rendered from the clock during hydration: the server and the browser can be on opposite sides of
 * a minute and React then throws away the page (error #418).
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => now, () => null);
}
