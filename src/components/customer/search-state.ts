"use client";

import { useSyncExternalStore } from "react";

// Shared state between the search box and the results: what's typed (live, every keystroke),
// whether a server search is running, and result counts for the tabs.
type State = { searching: boolean; query: string; counts: { dishes: number; reels: number; restaurants: number } | null };
let state: State = { searching: false, query: "", counts: null };
const subs = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
}
const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb));
const use = <T,>(pick: (s: State) => T, fallback: T) => useSyncExternalStore(subscribe, () => pick(state), () => fallback);

export function setSearching(v: boolean) {
  if (state.searching !== v) set({ searching: v });
}
export function setQuery(query: string) {
  if (state.query !== query) set({ query });
}
export function setCounts(counts: State["counts"]) {
  const c = state.counts;
  if (c === counts || (c && counts && c.dishes === counts.dishes && c.reels === counts.reels && c.restaurants === counts.restaurants)) return;
  set({ counts });
}
export const useSearching = () => use((s) => s.searching, false);
export const useQuery = () => use((s) => s.query, "");
export const useCounts = () => use((s) => s.counts, null);
