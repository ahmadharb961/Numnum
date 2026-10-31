import "server-only";
import { gzipSync } from "node:zlib";
import { prisma } from "./db";
import { publicReelWhere } from "./feed";
import { getMainImages } from "./menu";

// Everything the Explore search needs, sent to the phone once so results appear while typing
// with no server round trip. Rebuilt at most once a minute.

const clip = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

async function build() {
  const [restaurants, items, reels, categories] = await Promise.all([
    prisma.restaurant.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, slug: true, displayName: true, logoUrl: true, coverUrl: true, cuisine: true, area: true, city: true, description: true, verificationStatus: true, ratingAvg: true, ratingCount: true, deliveryEnabled: true, pickupEnabled: true, openingHours: true, avgPrepMinutes: true, latitude: true, longitude: true, deliveryZones: true, totalReelViews: true },
      orderBy: [{ verificationStatus: "asc" }, { ratingCount: "desc" }, { totalReelViews: "desc" }],
    }),
    prisma.menuItem.findMany({
      where: { archived: false, restaurant: { status: "ACTIVE" } },
      select: { id: true, name: true, description: true, ingredients: true, priceCents: true, currency: true, ratingAvg: true, ratingCount: true, available: true, restaurantId: true, menuCategory: { select: { name: true } }, foodCategory: { select: { slug: true } } },
      orderBy: [{ ratingCount: "desc" }, { viewCount: "desc" }, { createdAt: "desc" }],
    }),
    prisma.reel.findMany({ where: publicReelWhere, select: { id: true, posterUrl: true, viewCount: true, menuItemId: true, caption: true }, orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }] }),
    prisma.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, nameAr: true, emoji: true, imageUrl: true } }),
  ]);
  const images = await getMainImages(items.map((i) => i.id));
  return {
    builtAt: Date.now(),
    categories,
    restaurants: restaurants.map(({ totalReelViews, description, ...r }) => ({ ...r, description: clip(description, 200), views: totalReelViews })),
    dishes: items.map((i) => ({
      id: i.id,
      name: i.name,
      description: clip(i.description, 160),
      ingredients: clip(i.ingredients, 160),
      priceCents: i.priceCents,
      currency: i.currency,
      ratingAvg: i.ratingAvg,
      ratingCount: i.ratingCount,
      available: i.available,
      restaurantId: i.restaurantId,
      section: i.menuCategory?.name ?? null,
      category: i.foodCategory?.slug ?? null,
      image: images.get(i.id) ?? null,
    })),
    reels: reels.map((r) => ({ id: r.id, posterUrl: r.posterUrl, views: r.viewCount, dishId: r.menuItemId, caption: clip(r.caption, 120) })),
  };
}

export type SearchIndex = Awaited<ReturnType<typeof build>>;

type Built = { json: string; gzip: Buffer; at: number };
let cached: Built | null = null;
let building: Promise<Built> | null = null;

/** The index as JSON (plain and gzipped), from memory when it's less than a minute old. */
export async function searchIndex(): Promise<Built> {
  if (cached && Date.now() - cached.at < 60_000) return cached;
  building ??= build()
    .then((d) => {
      const json = JSON.stringify(d);
      cached = { json, gzip: gzipSync(json), at: Date.now() };
      return cached;
    })
    .finally(() => {
      building = null;
    });
  // Serve the previous copy while a fresh one builds.
  return cached ?? building;
}
