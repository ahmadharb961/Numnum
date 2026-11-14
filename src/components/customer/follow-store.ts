"use client";

import { useSyncExternalStore } from "react";
import { followAction } from "@/actions/follows";

// One shared follow state on the phone: following from a reel instantly shows "Following" (and the
// new count) on the restaurant page and on every reel of that restaurant, and the other way round,
// even where the page was preloaded before the tap.

type State = { following: boolean; count?: number };
const states = new Map<string, State>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFollowState(restaurantId: string, initialFollowing: boolean, initialCount?: number): { following: boolean; count: number | undefined } {
  const s = useSyncExternalStore(
    subscribe,
    () => states.get(restaurantId),
    () => undefined,
  );
  return { following: s?.following ?? initialFollowing, count: s?.count ?? initialCount };
}

/**
 * Follow / unfollow: updates every screen at once, saves it, and clears the app's preloaded pages
 * (server action) so nothing shows the old state. Reverts if saving fails. Returns false on failure.
 */
export async function setFollowing(restaurantId: string, follow: boolean, currentCount?: number): Promise<"ok" | "login" | "error"> {
  const before = states.get(restaurantId);
  states.set(restaurantId, { following: follow, count: currentCount != null ? Math.max(0, currentCount + (follow ? 1 : -1)) : before?.count });
  emit();
  const r = await followAction(restaurantId, follow).catch(() => ({ ok: false as const, login: false }));
  if (r.ok) {
    states.set(restaurantId, { following: r.following, count: r.followerCount });
    emit();
    return "ok";
  }
  if (before) states.set(restaurantId, before);
  else states.delete(restaurantId);
  emit();
  return r.login ? "login" : "error";
}
