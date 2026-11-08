"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during server render and before hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
