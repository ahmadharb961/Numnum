import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getMainImages } from "./menu";
import { publicReelWhere, reelCardSelect, toPublicReel } from "./feed";

export type SearchParams = {
  q?: string;
  type?: "dishes" | "reels" | "restaurants";
  category?: string;
  cuisine?: string;
  area?: string;
  minPrice?: number;
  maxPrice?: number;
  delivery?: boolean;
  pickup?: boolean;
  verified?: boolean;
  available?: boolean;
  minRating?: number; // restaurant rating
  minItemRating?: number;
  page?: number;
  /** restaurant ids that deliver to the viewer (set when "Delivers to me" is on) */
  nearIds?: string[];
};

export function parseSearchParams(sp: Record<string, string | string[] | undefined>): SearchParams {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined) || undefined;
  const n = (k: string) => {
    const v = s(k);
    return v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };
  const b = (k: string) => s(k) === "1" || undefined;
  const type = s("type");
  return {
    q: s("q")?.slice(0, 80),
    type: type === "reels" || type === "restaurants" ? type : "dishes",
    category: s("category"),
    cuisine: s("cuisine"),
    area: s("area"),
    minPrice: n("minPrice"),
    maxPrice: n("maxPrice"),
    delivery: b("delivery"),
    pickup: b("pickup"),
    verified: b("verified"),
    available: b("available"),
    minRating: n("minRating"),
    minItemRating: n("minItemRating"),
    page: Math.max(1, n("page") ?? 1),
  };
}

function restaurantWhere(p: SearchParams): Prisma.RestaurantWhereInput {
  const and: Prisma.RestaurantWhereInput[] = [{ status: "ACTIVE" }];
  if (p.cuisine) and.push({ cuisine: { contains: p.cuisine, mode: "insensitive" } });
  if (p.area) and.push({ OR: [{ area: { contains: p.area, mode: "insensitive" } }, { city: { contains: p.area, mode: "insensitive" } }] });
  if (p.nearIds) and.push({ id: { in: p.nearIds } });
  if (p.delivery) and.push({ deliveryEnabled: true });
  if (p.pickup) and.push({ pickupEnabled: true });
  if (p.verified) and.push({ verificationStatus: "APPROVED" });
  if (p.minRating) and.push({ ratingAvg: { gte: p.minRating } });
  return { AND: and };
}

function itemWhere(p: SearchParams): Prisma.MenuItemWhereInput {
  const and: Prisma.MenuItemWhereInput[] = [{ archived: false, restaurant: restaurantWhere(p) }];
  if (p.q) {
    const q = p.q;
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { ingredients: { contains: q, mode: "insensitive" } },
        { menuCategory: { name: { contains: q, mode: "insensitive" } } },
        { foodCategory: { name: { contains: q, mode: "insensitive" } } },
        { restaurant: { displayName: { contains: q, mode: "insensitive" } } },
        { restaurant: { cuisine: { contains: q, mode: "insensitive" } } },
        { restaurant: { area: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (p.category) and.push({ foodCategory: { slug: p.category } });
  if (p.minPrice !== undefined) and.push({ priceCents: { gte: Math.round(p.minPrice * 100) } });
  if (p.maxPrice !== undefined) and.push({ priceCents: { lte: Math.round(p.maxPrice * 100) } });
  if (p.available) and.push({ available: true });
  if (p.minItemRating) and.push({ ratingAvg: { gte: p.minItemRating } });
  return { AND: and };
}

const PAGE = 24;

export async function searchDishes(p: SearchParams) {
  const where = itemWhere(p);
  const [items, total] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      include: { restaurant: { select: { slug: true, displayName: true, verificationStatus: true, area: true } } },
      orderBy: [{ ratingCount: "desc" }, { viewCount: "desc" }, { createdAt: "desc" }],
      skip: ((p.page ?? 1) - 1) * PAGE,
      take: PAGE,
    }),
    prisma.menuItem.count({ where }),
  ]);
  const images = await getMainImages(items.map((i) => i.id));
  return { items: items.map((i) => ({ ...i, image: images.get(i.id) ?? null })), total, pages: Math.ceil(total / PAGE) };
}

export async function searchReels(p: SearchParams) {
  const reels = await prisma.reel.findMany({
    where: { ...publicReelWhere, menuItem: itemWhere(p) },
    select: reelCardSelect,
    orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }],
    skip: ((p.page ?? 1) - 1) * PAGE,
    take: PAGE,
  });
  return reels.map((r) => toPublicReel(r));
}

export async function searchRestaurants(p: SearchParams) {
  const where = restaurantWhere(p);
  if (p.q) {
    (where.AND as Prisma.RestaurantWhereInput[]).push({
      OR: [
        { displayName: { contains: p.q, mode: "insensitive" } },
        { cuisine: { contains: p.q, mode: "insensitive" } },
        { area: { contains: p.q, mode: "insensitive" } },
        { description: { contains: p.q, mode: "insensitive" } },
        { menuItems: { some: { archived: false, name: { contains: p.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (p.category) (where.AND as Prisma.RestaurantWhereInput[]).push({ menuItems: { some: { archived: false, foodCategory: { slug: p.category } } } });
  return prisma.restaurant.findMany({
    where,
    select: { id: true, slug: true, displayName: true, logoUrl: true, coverUrl: true, cuisine: true, area: true, city: true, verificationStatus: true, ratingAvg: true, ratingCount: true, deliveryEnabled: true, pickupEnabled: true, openingHours: true, avgPrepMinutes: true, latitude: true, longitude: true, deliveryZones: true, _count: { select: { menuItems: { where: { archived: false } } } } },
    orderBy: [{ verificationStatus: "asc" }, { ratingCount: "desc" }, { totalReelViews: "desc" }],
    skip: ((p.page ?? 1) - 1) * PAGE,
    take: PAGE,
  });
}

export async function facets() {
  const [categories, areas, cuisines] = await Promise.all([
    prisma.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.restaurant.findMany({ where: { status: "ACTIVE", area: { not: null } }, select: { area: true }, distinct: ["area"], orderBy: { area: "asc" } }),
    prisma.restaurant.findMany({ where: { status: "ACTIVE", cuisine: { not: null } }, select: { cuisine: true }, distinct: ["cuisine"], orderBy: { cuisine: "asc" } }),
  ]);
  return { categories, areas: areas.map((a) => a.area!).filter(Boolean), cuisines: cuisines.map((c) => c.cuisine!).filter(Boolean) };
}

/** Ids of active restaurants that deliver to a location. */
export async function restaurantsDeliveringTo(loc: { lat: number; lng: number }) {
  const { quoteDelivery } = await import("@/lib/geo");
  const rs = await prisma.restaurant.findMany({ where: { status: "ACTIVE", deliveryEnabled: true, latitude: { not: null } }, select: { id: true, latitude: true, longitude: true, deliveryZones: true } });
  return rs.filter((r) => quoteDelivery(r, loc).deliverable).map((r) => r.id);
}
