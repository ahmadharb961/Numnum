"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Countdowns use the server's clock, not the visitor's (which may be wrong).
 * We remember the offset between the two at page load.
 */
const ClockContext = createContext<() => number>(() => Date.now());

export function ServerClockProvider({ serverNow, children }: { serverNow: number; children: ReactNode }) {
  const [offset] = useState(() => {
    const diff = serverNow - Date.now();
    // Ignore tiny differences caused by render/transfer time.
    return Math.abs(diff) > 5000 ? diff : 0;
  });
  const now = useCallback(() => Date.now() + offset, [offset]);
  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}

export function useServerClock() {
  return useContext(ClockContext);
}
