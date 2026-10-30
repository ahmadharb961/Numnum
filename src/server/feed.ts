import "server-only";
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
export async function getFeed(opts: { cursor?: number; limit?: number; location?: LatLng | null; categories?: string[]; excludeIds?: string[] }) {
  const settings = await getSettings();
  const limit = Math.min(opts.limit ?? 6, 12);
  const offset = opts.cursor ?? 0;
  const candidates = await prisma.reel.findMany({
    where: { ...publicReelWhere, id: opts.excludeIds?.length ? { notIn: opts.excludeIds } : undefined },
    select: { ...reelCardSelect, saveCount: true, orderInits: true },
    orderBy: { publishedAt: "desc" },
    take: 400,
  });
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
    reels: page.map((r) => toPublicReel(r, opts.location)),
    nextCursor: offset + limit < ranked.length ? offset + limit : null,
  };
}

export function toPublicReel(r: ReelCard, location?: LatLng | null) {
  const q = location ? quoteDelivery(r.restaurant, location) : null;
  return {
    id: r.id,
    caption: r.caption,
    videoUrl: r.videoUrl,
    posterUrl: r.posterUrl,
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
      location: [r.restaurant.area, r.restaurant.city].filter(Boolean).join(", "),
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
  };
}

export type PublicReel = ReturnType<typeof toPublicReel>;
