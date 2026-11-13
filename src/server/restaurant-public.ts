import "server-only";
import { cache } from "react";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";

/**
 * The public restaurant page: loaded once per request (page + metadata). Every query starts at once
 * (each finds the restaurant by slug or id itself), so it costs about two database round trips.
 */
export const getPublicRestaurant = cache(async function getPublicRestaurant(key: string, by: "slug" | "id" = "slug") {
  const where = by === "slug" ? { slug: key, status: "ACTIVE" as const } : { id: key, status: "ACTIVE" as const };
  const [r, items, reels, sub, reviews] = await Promise.all([
    prisma.restaurant.findFirst({
      where,
      include: {
        menuCategories: { orderBy: { sortOrder: "asc" } },
        _count: { select: { menuItems: { where: { archived: false } }, reels: { where: { visibility: "PUBLISHED", status: "READY" } } } },
      },
    }),
    prisma.menuItem.findMany({
      where: { restaurant: where, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, description: true, priceCents: true, currency: true, ratingAvg: true, ratingCount: true, available: true, menuCategoryId: true, dietaryLabels: true,
        images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], take: 1, select: { asset: { select: { url: true, thumbUrl: true } } } },
      },
    }),
    prisma.reel.findMany({
      where: { restaurant: where, visibility: "PUBLISHED", status: "READY", menuItem: { archived: false } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, posterUrl: true, viewCount: true, menuItem: { select: { name: true } } },
    }),
    prisma.restaurantReview.aggregate({ where: { restaurant: where, status: "VISIBLE" }, _avg: { foodQuality: true, service: true, value: true, delivery: true } }),
    // Reviews by people the visitor blocked are left out.
    getCurrentUser().then((me) =>
      prisma.restaurantReview.findMany({
        where: { restaurant: where, status: "VISIBLE", ...(me ? { user: { blockedBy: { none: { userId: me.id } } } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, rating: true, foodQuality: true, service: true, value: true, delivery: true, body: true, evidence: true, reply: true, createdAt: true, user: { select: { name: true } } },
      }),
    ),
  ]);
  if (!r) return null;

  const sections = [
    ...r.menuCategories.map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.menuCategoryId === c.id) })),
    { id: "other", name: "More", items: items.filter((i) => !i.menuCategoryId || !r.menuCategories.some((c) => c.id === i.menuCategoryId)) },
  ]
    .filter((s) => s.items.length)
    .map((s) => ({ ...s, items: s.items.map(({ images, ...i }) => ({ ...i, image: images[0]?.asset ?? null })) }));

  return { restaurant: r, sections, reels, reviews: reviews.map((x) => ({ ...x, userName: x.user.name.split(" ")[0] })), subRatings: sub._avg };
});
