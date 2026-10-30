import "server-only";
import { prisma } from "./db";
import { getMainImages } from "./menu";

export async function getPublicRestaurant(slug: string) {
  const r = await prisma.restaurant.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      menuCategories: { orderBy: { sortOrder: "asc" } },
      _count: { select: { menuItems: { where: { archived: false } }, reels: { where: { visibility: "PUBLISHED", status: "READY" } } } },
    },
  });
  if (!r) return null;
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: r.id, archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, priceCents: true, currency: true, ratingAvg: true, ratingCount: true, available: true, menuCategoryId: true, dietaryLabels: true },
  });
  const images = await getMainImages(items.map((i) => i.id));
  const reels = await prisma.reel.findMany({
    where: { restaurantId: r.id, visibility: "PUBLISHED", status: "READY", menuItem: { archived: false } },
    orderBy: { publishedAt: "desc" },
    select: { id: true, posterUrl: true, viewCount: true, menuItem: { select: { name: true } } },
  });
  const reviews = await prisma.restaurantReview.findMany({
    where: { restaurantId: r.id, status: "VISIBLE" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, rating: true, foodQuality: true, service: true, value: true, delivery: true, body: true, evidence: true, reply: true, createdAt: true, user: { select: { name: true } } },
  });
  const sub = await prisma.restaurantReview.aggregate({ where: { restaurantId: r.id, status: "VISIBLE" }, _avg: { foodQuality: true, service: true, value: true, delivery: true } });

  const sections = [
    ...r.menuCategories.map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.menuCategoryId === c.id) })),
    { id: "other", name: "More", items: items.filter((i) => !i.menuCategoryId || !r.menuCategories.some((c) => c.id === i.menuCategoryId)) },
  ]
    .filter((s) => s.items.length)
    .map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, image: images.get(i.id) ?? null })) }));

  return { restaurant: r, sections, reels, reviews: reviews.map((x) => ({ ...x, userName: x.user.name.split(" ")[0] })), subRatings: sub._avg };
}
