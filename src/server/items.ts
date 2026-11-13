import "server-only";
import { placeLabel } from "@/lib/utils";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";

export async function getPublicItem(id: string) {
  // Everything at once: the dish, its reviews (leaving out people the visitor blocked) and the star counts.
  const [item, reviews, dist] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { id, archived: false, restaurant: { status: "ACTIVE" } },
      include: {
        restaurant: { select: { id: true, slug: true, displayName: true, logoUrl: true, currency: true, verificationStatus: true, orderingEnabled: true, area: true, city: true } },
        images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], include: { asset: { select: { url: true, thumbUrl: true, width: true, height: true } } } },
        customizations: { orderBy: { sortOrder: "asc" }, include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } } },
        reels: { where: { visibility: "PUBLISHED", status: "READY" }, select: { id: true, posterUrl: true, viewCount: true }, take: 6, orderBy: { publishedAt: "desc" } },
        foodCategory: { select: { name: true, slug: true } },
        menuCategory: { select: { name: true } },
      },
    }),
    getCurrentUser().then((me) =>
      prisma.itemReview.findMany({
        where: { menuItemId: id, status: "VISIBLE", ...(me ? { user: { blockedBy: { none: { userId: me.id } } } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, rating: true, body: true, photoUrl: true, evidence: true, reply: true, createdAt: true, user: { select: { name: true } } },
      }),
    ),
    prisma.itemReview.groupBy({ by: ["rating"], where: { menuItemId: id, status: "VISIBLE" }, _count: true }),
  ]);
  if (!item) return null;
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    description: item.description,
    ingredients: item.ingredients,
    allergens: item.allergens,
    dietaryLabels: item.dietaryLabels,
    prepTimeMinutes: item.prepTimeMinutes,
    priceCents: item.priceCents,
    currency: item.currency,
    available: item.available,
    ratingAvg: item.ratingAvg,
    ratingCount: item.ratingCount,
    category: item.menuCategory?.name ?? null,
    foodCategory: item.foodCategory,
    restaurant: {
      id: item.restaurant.id,
      slug: item.restaurant.slug,
      name: item.restaurant.displayName,
      logoUrl: item.restaurant.logoUrl,
      currency: item.restaurant.currency,
      verified: item.restaurant.verificationStatus === "APPROVED",
      orderingEnabled: item.restaurant.orderingEnabled,
      location: placeLabel(item.restaurant.area, item.restaurant.city),
    },
    images: item.images.map((i) => ({ url: i.asset.url, thumbUrl: i.asset.thumbUrl, width: i.asset.width, height: i.asset.height })),
    groups: item.customizations.map((c) => ({
      id: c.group.id,
      name: c.group.name,
      type: c.group.type,
      required: c.group.required,
      minSelect: c.group.minSelect,
      maxSelect: c.group.maxSelect,
      options: c.group.options.map((o) => ({ id: o.id, name: o.name, priceDeltaCents: o.priceDeltaCents, available: o.available, isDefault: o.isDefault })),
    })),
    reels: item.reels,
    reviews: reviews.map((r) => ({ ...r, userName: r.user.name.split(" ")[0], createdAt: r.createdAt.toISOString() })),
    distribution: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: dist.find((d) => d.rating === s)?._count ?? 0 })),
  };
}

export type PublicItem = NonNullable<Awaited<ReturnType<typeof getPublicItem>>>;
