import "server-only";
import { cache } from "react";
import { getBlocks } from "./blocks";
import { prisma } from "./db";
import { getMainImages } from "./menu";

// cache(): the page and its metadata both ask for the restaurant; load it once per request.
export const getPublicRestaurant = cache(async (slug: string) => {
  const r = await prisma.restaurant.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      menuCategories: { orderBy: { sortOrder: "asc" } },
      _count: { select: { menuItems: { where: { archived: false } }, reels: { where: { visibility: "PUBLISHED", status: "READY" } } } },
    },
  });
  if (!r) return null;
  // Everything below only needs the restaurant id: load it in parallel, not one query after another.
  const [items, reels, reviews, sub] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: r.id, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, priceCents: true, currency: true, ratingAvg: true, ratingCount: true, available: true, menuCategoryId: true, dietaryLabels: true },
    }),
    prisma.reel.findMany({
      where: { restaurantId: r.id, visibility: "PUBLISHED", status: "READY", menuItem: { archived: false } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, posterUrl: true, viewCount: true, menuItem: { select: { name: true } } },
    }),
    getBlocks().then(({ userIds: hidden }) => // reviewers the visitor blocked
      prisma.restaurantReview.findMany({
        where: { restaurantId: r.id, status: "VISIBLE", ...(hidden.length ? { userId: { notIn: hidden } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, rating: true, foodQuality: true, service: true, value: true, delivery: true, body: true, evidence: true, reply: true, createdAt: true, user: { select: { name: true } } },
      }),
    ),
    prisma.restaurantReview.aggregate({ where: { restaurantId: r.id, status: "VISIBLE" }, _avg: { foodQuality: true, service: true, value: true, delivery: true } }),
  ]);
  const images = await getMainImages(items.map((i) => i.id));

  const sections = [
    ...r.menuCategories.map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.menuCategoryId === c.id) })),
    { id: "other", name: "More", items: items.filter((i) => !i.menuCategoryId || !r.menuCategories.some((c) => c.id === i.menuCategoryId)) },
  ]
    .filter((s) => s.items.length)
    .map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, image: images.get(i.id) ?? null })) }));

  return { restaurant: r, sections, reels, reviews: reviews.map((x) => ({ ...x, userName: x.user.name.split(" ")[0] })), subRatings: sub._avg };
});
