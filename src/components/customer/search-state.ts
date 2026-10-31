"use client";

import { useSyncExternalStore } from "react";

// Shared "a search is running" flag between the search box and the results list.
let searching = false;
const subs = new Set<() => void>();
export function setSearching(v: boolean) {
  if (v === searching) return;
  searching = v;
  subs.forEach((s) => s());
}
export function useSearching() {
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => void subs.delete(cb)),
    () => searching,
    () => false,
  );
}
