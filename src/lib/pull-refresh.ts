"use client";

import { useEffect, useRef } from "react";

// What a pull-to-refresh reloads besides the page itself: screens that keep their own data in the
// browser (Explore's search results…) register a step here; the spinner waits for all of them.
const steps = new Set<() => Promise<unknown>>();

export function runRefreshSteps() {
  return Promise.allSettled([...steps].map((s) => s()));
}

/** Run `fn` when the person pulls the page down to refresh (while this component is shown). */
export function usePullRefresh(fn: () => Promise<unknown>) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const step = () => ref.current();
    steps.add(step);
    return () => void steps.delete(step);
  }, []);
}
