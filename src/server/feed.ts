import "server-only";
import { liveDeals } from "./deals";
import { dealForDish, dealPrice, type ShownDeal } from "@/lib/deals";
import { placeLabel } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { rankReels } from "@/lib/ranking";
import { quoteDelivery, type LatLng } from "@/lib/geo";

export const reelCardSelect = {
  id: true,
  caption: true,
  videoUrl: true,
  posterUrl: true,
  viewCount: true,
  likeCount: true,
  shareCount: true,
  sponsored: true,
  featured: true,
  publishedAt: true,
  restaurantId: true,
  restaurant: { select: { id: true, slug: true, displayName: true, logoUrl: true, coverUrl: true, cuisine: true, ratingAvg: true, ratingCount: true, avgPrepMinutes: true, verificationStatus: true, area: true, city: true, orderingEnabled: true, status: true, latitude: true, longitude: true, deliveryZones: true, deliveryEnabled: true } },
  menuItem: { select: { id: true, name: true, description: true, priceCents: true, currency: true, ratingAvg: true, ratingCount: true, available: true, archived: true, foodCategoryId: true } },
} satisfies Prisma.ReelSelect;

export type ReelCard = Prisma.ReelGetPayload<{ select: typeof reelCardSelect }>;

export const publicReelWhere: Prisma.ReelWhereInput = {
  visibility: "PUBLISHED",
  status: "READY",
  restaurant: { status: "ACTIVE" },
  menuItem: { archived: false },
};

/**
 * Ranked, paginated feed. Ranks a recent candidate window (cheap and
 * configurable), then pages through the ranked list with an offset cursor.
 */
const POOL_MS = 30_000;
const poolSelect = { ...reelCardSelect, saveCount: true, orderInits: true } as const;
type PoolReel = Prisma.ReelGetPayload<{ select: typeof poolSelect }>;
// One pool per server process (globalThis: Next gives each bundle its own module variables).
const poolStore = globalThis as typeof globalThis & { __nnFeedPool?: { at: number; rows: Promise<PoolReel[]> } | null };

/** The newest 400 public reels, shared across requests for POOL_MS (read-only: never mutated). */
function candidatePool(): Promise<PoolReel[]> {
  let pool = poolStore.__nnFeedPool;
  if (!pool || Date.now() - pool.at > POOL_MS) {
    const rows = prisma.reel.findMany({ where: publicReelWhere, select: poolSelect, orderBy: { publishedAt: "desc" }, take: 400 });
    pool = poolStore.__nnFeedPool = { at: Date.now(), rows };
    rows.catch(() => {
      if (poolStore.__nnFeedPool?.rows === rows) poolStore.__nnFeedPool = null; // a failed load isn't kept
    });
  }
  return pool.rows;
}

export async function getFeed(opts: { cursor?: number; limit?: number; location?: LatLng | null; categories?: string[]; excludeIds?: string[]; viewerId?: string | null }) {
  const settings = await getSettings();
  const limit = Math.min(opts.limit ?? 6, 12);
  const offset = opts.cursor ?? 0;
  // The candidate pool is shared by everyone for POOL_MS (one query per 30 s instead of one per feed
  // page per user); what's personal (blocked restaurants, reels to skip, distance) is applied here.
  const [pool, blocked] = await Promise.all([
    candidatePool(),
    opts.viewerId ? prisma.userBlock.findMany({ where: { userId: opts.viewerId, restaurantId: { not: null } }, select: { restaurantId: true } }) : [],
  ]);
  const skip = new Set(opts.excludeIds ?? []);
  const blockedIds = new Set(blocked.map((b) => b.restaurantId));
  const candidates = pool.filter((c) => !skip.has(c.id) && !blockedIds.has(c.restaurant.id));
  const ranked = rankReels(
    candidates.map((c) => ({
      ...c,
      publishedAt: c.publishedAt ?? new Date(0),
      deliversToViewer: opts.location ? c.restaurant.deliveryEnabled && quoteDelivery(c.restaurant, opts.location).deliverable : null,
      foodCategoryId: c.menuItem.foodCategoryId,
      sponsored: c.sponsored,
    })),
    settings.feedWeights,
    { preferredCategories: opts.categories },
  );
  const page = ranked.slice(offset, offset + limit);
  return {
    reels: await attachDeals(page.map((r) => toPublicReel(r, opts.location))),
    nextCursor: offset + limit < ranked.length ? offset + limit : null,
  };
}

export function toPublicReel(r: ReelCard, location?: LatLng | null) {
  const q = location ? quoteDelivery(r.restaurant, location) : null;
  return {
    id: r.id,
    caption: r.caption,
    videoUrl: r.videoUrl,
    posterUrl: r.posterUrl?.replace("height=1280", "height=960") ?? null,
    viewCount: r.viewCount,
    likeCount: r.likeCount,
    shareCount: r.shareCount,
    sponsored: r.sponsored,
    restaurant: {
      id: r.restaurant.id,
      slug: r.restaurant.slug,
      name: r.restaurant.displayName,
      logoUrl: r.restaurant.logoUrl,
      coverUrl: r.restaurant.coverUrl,
      cuisine: r.restaurant.cuisine,
      ratingAvg: r.restaurant.ratingAvg,
      ratingCount: r.restaurant.ratingCount,
      avgPrepMinutes: r.restaurant.avgPrepMinutes,
      verified: r.restaurant.verificationStatus === "APPROVED",
      location: placeLabel(r.restaurant.area, r.restaurant.city),
      orderingEnabled: r.restaurant.orderingEnabled,
      distanceKm: q?.km ?? null,
      deliversToYou: q ? r.restaurant.deliveryEnabled && q.deliverable : null,
    },
    item: {
      id: r.menuItem.id,
      name: r.menuItem.name,
      description: r.menuItem.description,
      priceCents: r.menuItem.priceCents,
      currency: r.menuItem.currency,
      ratingAvg: r.menuItem.ratingAvg,
      ratingCount: r.menuItem.ratingCount,
      available: r.menuItem.available,
    },
    /** The restaurant's deal shown on this reel, and the dish's price after it (see attachDeals). */
    deal: null as ShownDeal | null,
    dealPriceCents: null as number | null,
  };
}

export type PublicReel = ReturnType<typeof toPublicReel>;

/** Adds each reel's live deal (badge + the dish's deal price): one query for the whole page. */
export async function attachDeals<R extends PublicReel>(reels: R[]): Promise<R[]> {
  const deals = await liveDeals(reels.map((r) => r.restaurant.id), { cached: true });
  return reels.map((r) => {
    const list = deals.get(r.restaurant.id) ?? [];
    return list.length ? { ...r, deal: dealForDish(list, r.item.id), dealPriceCents: dealPrice(list, r.item.id, r.item.priceCents) } : r;
  });
}
