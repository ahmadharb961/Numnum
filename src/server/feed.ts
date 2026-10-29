import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { rankReels } from "@/lib/ranking";

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
  restaurant: { select: { id: true, slug: true, displayName: true, logoUrl: true, verificationStatus: true, area: true, city: true, orderingEnabled: true, status: true } },
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
export async function getFeed(opts: { cursor?: number; limit?: number; area?: string | null; categories?: string[]; excludeIds?: string[] }) {
  const settings = await getSettings();
  const limit = Math.min(opts.limit ?? 6, 12);
  const offset = opts.cursor ?? 0;
  const candidates = await prisma.reel.findMany({
    where: { ...publicReelWhere, id: opts.excludeIds?.length ? { notIn: opts.excludeIds } : undefined },
    select: { ...reelCardSelect, saveCount: true, orderInits: true, restaurant: { select: { ...reelCardSelect.restaurant.select, deliveryAreas: { select: { name: true } } } } },
    orderBy: { publishedAt: "desc" },
    take: 400,
  });
  const ranked = rankReels(
    candidates.map((c) => ({
      ...c,
      publishedAt: c.publishedAt ?? new Date(0),
      area: c.restaurant.area,
      deliveryAreas: c.restaurant.deliveryAreas.map((d) => d.name),
      foodCategoryId: c.menuItem.foodCategoryId,
      sponsored: c.sponsored,
    })),
    settings.feedWeights,
    { area: opts.area, preferredCategories: opts.categories },
  );
  const page = ranked.slice(offset, offset + limit);
  return {
    reels: page.map(toPublicReel),
    nextCursor: offset + limit < ranked.length ? offset + limit : null,
  };
}

export function toPublicReel(r: ReelCard) {
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
      verified: r.restaurant.verificationStatus === "APPROVED",
      location: [r.restaurant.area, r.restaurant.city].filter(Boolean).join(", "),
      orderingEnabled: r.restaurant.orderingEnabled,
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
