import "server-only";
import { prisma } from "./db";

// View counters (reel views, unique viewers, restaurant total views) are added up in memory and
// written once every few seconds per reel/restaurant, instead of two row updates on every single
// view. A viral reel would otherwise have thousands of viewers queueing on the same two rows.
// The per-view record (reel_views: dedupe + analytics) is still written straight away; only the
// display counters lag by up to FLUSH_MS.

const FLUSH_MS = 3000;
type Pending = { views: number; unique: number; restaurantId: string };
// One accumulator per server process (globalThis: Next gives each bundle its own module variables).
const g = globalThis as typeof globalThis & { __nnViews?: { pending: Map<string, Pending>; timer: ReturnType<typeof setTimeout> | null } };
const state = (g.__nnViews ??= { pending: new Map(), timer: null });

export function countView(reelId: string, restaurantId: string, unique: boolean) {
  const p = state.pending.get(reelId) ?? { views: 0, unique: 0, restaurantId };
  p.views++;
  if (unique) p.unique++;
  state.pending.set(reelId, p);
  if (!state.timer) {
    state.timer = setTimeout(() => void flushViewCounters(), FLUSH_MS);
    state.timer.unref?.();
  }
}

/** Writes the added-up counts. Never throws. (A restart loses at most the last few seconds of counts.) */
export async function flushViewCounters() {
  state.timer = null;
  if (!state.pending.size) return;
  const batch = state.pending;
  state.pending = new Map();
  const perRestaurant = new Map<string, number>();
  for (const p of batch.values()) perRestaurant.set(p.restaurantId, (perRestaurant.get(p.restaurantId) ?? 0) + p.views);
  try {
    await Promise.all([
      ...[...batch].map(([id, p]) => prisma.reel.updateMany({ where: { id }, data: { viewCount: { increment: p.views }, ...(p.unique ? { uniqueViewers: { increment: p.unique } } : {}) } })),
      ...[...perRestaurant].map(([id, n]) => prisma.restaurant.updateMany({ where: { id }, data: { totalReelViews: { increment: n } } })),
    ]);
  } catch (e) {
    // Put them back for the next flush rather than losing them.
    for (const [id, p] of batch) {
      const cur = state.pending.get(id) ?? { views: 0, unique: 0, restaurantId: p.restaurantId };
      cur.views += p.views;
      cur.unique += p.unique;
      state.pending.set(id, cur);
    }
    console.error("view counters flush failed", e);
    if (!state.timer) {
      state.timer = setTimeout(() => void flushViewCounters(), FLUSH_MS * 3);
      state.timer.unref?.();
    }
  }
}
