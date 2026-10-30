import "server-only";
import type { SavedType } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { getCurrentUser } from "./auth";
import { deviceId } from "./request";

/** Owner key for likes/saves: account when signed in, otherwise the anonymous device id. */
export async function ownerKey(): Promise<string | null> {
  const u = await getCurrentUser();
  if (u) return `u:${u.id}`;
  const d = await deviceId();
  return d ? `d:${d}` : null;
}

/**
 * Qualified view: the client reports only after the reel was ≥ 60% visible and
 * actually playing for the configured minimum. The server re-checks watch time
 * and de-duplicates per viewer within a window (refreshes / loops don't count).
 */
export async function recordView(reelId: string, watchMs: number) {
  const settings = await getSettings();
  const viewer = await ownerKey();
  if (!viewer) return { counted: false };
  if (!Number.isFinite(watchMs) || watchMs < settings.minViewMs) return { counted: false };
  const since = new Date(Date.now() - settings.viewDedupeMinutes * 60_000);
  return prisma.$transaction(async (tx) => {
    const reel = await tx.reel.findFirst({ where: { id: reelId, visibility: "PUBLISHED", status: "READY" }, select: { id: true, restaurantId: true } });
    if (!reel) return { counted: false };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`view:${reelId}:${viewer}`}))`;
    const recent = await tx.reelView.findFirst({ where: { reelId, viewerKey: viewer, createdAt: { gte: since } }, select: { id: true } });
    if (recent) return { counted: false };
    const seenBefore = await tx.reelView.findFirst({ where: { reelId, viewerKey: viewer }, select: { id: true } });
    await tx.reelView.create({ data: { reelId, viewerKey: viewer, watchMs: Math.min(Math.round(watchMs), 600_000) } });
    await tx.reel.update({ where: { id: reelId }, data: { viewCount: { increment: 1 }, uniqueViewers: seenBefore ? undefined : { increment: 1 } } });
    await tx.restaurant.update({ where: { id: reel.restaurantId }, data: { totalReelViews: { increment: 1 } } });
    return { counted: true };
  });
}

export async function toggleLike(reelId: string) {
  const key = await ownerKey();
  if (!key) throw new Error("Enable cookies to like reels");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.reelLike.findUnique({ where: { reelId_ownerKey: { reelId, ownerKey: key } } });
    if (existing) {
      await tx.reelLike.delete({ where: { id: existing.id } });
      const r = await tx.reel.update({ where: { id: reelId }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true, restaurantId: true } });
      return { liked: false, likeCount: Math.max(0, r.likeCount) };
    }
    await tx.reelLike.create({ data: { reelId, ownerKey: key } });
    const r = await tx.reel.update({ where: { id: reelId }, data: { likeCount: { increment: 1 } }, select: { likeCount: true, restaurantId: true } });
    await tx.analyticsEvent.create({ data: { type: "reel_liked", reelId, restaurantId: r.restaurantId } });
    return { liked: true, likeCount: r.likeCount };
  });
}

export async function toggleSave(type: SavedType, refId: string) {
  const key = await ownerKey();
  if (!key) throw new Error("Enable cookies to save");
  const existing = await prisma.savedItem.findUnique({ where: { ownerKey_type_refId: { ownerKey: key, type, refId } } });
  if (existing) {
    await prisma.savedItem.delete({ where: { id: existing.id } });
    if (type === "REEL") await prisma.reel.updateMany({ where: { id: refId, saveCount: { gt: 0 } }, data: { saveCount: { decrement: 1 } } });
    return { saved: false };
  }
  await prisma.savedItem.create({ data: { ownerKey: key, type, refId } });
  if (type === "REEL") await prisma.reel.updateMany({ where: { id: refId }, data: { saveCount: { increment: 1 } } });
  return { saved: true };
}

/** After sign-in, move device-scoped likes and saves to the account. */
export async function mergeDeviceIntoUser(userId: string) {
  const d = await deviceId();
  if (!d) return;
  const from = `d:${d}`, to = `u:${userId}`;
  const saves = await prisma.savedItem.findMany({ where: { ownerKey: from } });
  for (const s of saves) {
    await prisma.savedItem.upsert({ where: { ownerKey_type_refId: { ownerKey: to, type: s.type, refId: s.refId } }, create: { ownerKey: to, type: s.type, refId: s.refId }, update: {} });
  }
  await prisma.savedItem.deleteMany({ where: { ownerKey: from } });
  const likes = await prisma.reelLike.findMany({ where: { ownerKey: from } });
  for (const l of likes) {
    const dup = await prisma.reelLike.findUnique({ where: { reelId_ownerKey: { reelId: l.reelId, ownerKey: to } } });
    if (dup) {
      await prisma.reelLike.delete({ where: { id: l.id } });
      await prisma.reel.update({ where: { id: l.reelId }, data: { likeCount: { decrement: 1 } } });
    } else await prisma.reelLike.update({ where: { id: l.id }, data: { ownerKey: to } });
  }
}

export async function likedAndSaved(reelIds: string[]) {
  const key = await ownerKey();
  if (!key || !reelIds.length) return { liked: new Set<string>(), saved: new Set<string>() };
  const [likes, saves] = await Promise.all([
    prisma.reelLike.findMany({ where: { ownerKey: key, reelId: { in: reelIds } }, select: { reelId: true } }),
    prisma.savedItem.findMany({ where: { ownerKey: key, type: "REEL", refId: { in: reelIds } }, select: { refId: true } }),
  ]);
  return { liked: new Set(likes.map((l) => l.reelId)), saved: new Set(saves.map((s) => s.refId)) };
}

const COUNTER_EVENTS: Record<string, "shareCount" | "productOpens" | "addToCarts"> = {
  reel_shared: "shareCount",
  product_opened: "productOpens",
  add_to_cart: "addToCarts",
};

export const ANALYTICS_EVENTS = [
  "homepage_opened",
  "reel_shared",
  "restaurant_opened",
  "product_opened",
  "add_to_cart",
  "cart_reviewed",
  "checkout_started",
  "order_details_completed",
] as const;

export async function trackEvent(type: (typeof ANALYTICS_EVENTS)[number], refs: { reelId?: string; menuItemId?: string; restaurantId?: string }) {
  const d = await deviceId();
  let restaurantId = refs.restaurantId;
  if (refs.reelId) {
    const reel = await prisma.reel.findUnique({ where: { id: refs.reelId }, select: { restaurantId: true } });
    if (!reel) return;
    restaurantId = reel.restaurantId;
    const field = COUNTER_EVENTS[type];
    if (field) await prisma.reel.update({ where: { id: refs.reelId }, data: { [field]: { increment: 1 } } });
  }
  if (refs.menuItemId && type === "product_opened") {
    const item = await prisma.menuItem.update({ where: { id: refs.menuItemId }, data: { viewCount: { increment: 1 } }, select: { restaurantId: true } }).catch(() => null);
    restaurantId = restaurantId ?? item?.restaurantId;
  }
  await prisma.analyticsEvent.create({ data: { type, reelId: refs.reelId, menuItemId: refs.menuItemId, restaurantId, deviceKey: d } });
}
