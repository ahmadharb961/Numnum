import "server-only";
import { prisma } from "./db";
import { norm } from "@/lib/search-match";

// Keeps the normalized search columns (searchName/searchText, trigram-indexed) up to date.
// Database triggers set "searchedAt" = NULL whenever the source text changes (see the
// search_index migration); this rebuilds those rows in batches.

const join = (...parts: (string | null | undefined)[]) => norm(parts.filter(Boolean).join(" "));

/** Rebuilds up to `limit` stale dishes and restaurants. Returns how many were updated. */
export async function refreshSearchText(limit = 2000) {
  const items = await prisma.menuItem.findMany({
    where: { searchedAt: null },
    take: limit,
    select: {
      id: true,
      name: true,
      description: true,
      ingredients: true,
      dietaryLabels: true,
      updatedAt: true,
      menuCategory: { select: { name: true } },
      foodCategory: { select: { name: true, nameAr: true } },
      restaurant: { select: { displayName: true, cuisine: true, area: true, city: true } },
    },
  });
  if (items.length) {
    const ids = items.map((i) => i.id);
    const names = items.map((i) => norm(i.name));
    const texts = items.map((i) =>
      join(i.name, i.foodCategory?.name, i.foodCategory?.nameAr, i.menuCategory?.name, i.restaurant.displayName, i.restaurant.cuisine, i.restaurant.area, i.restaurant.city, i.dietaryLabels.join(" "), i.ingredients, i.description),
    );
    const stamps = items.map((i) => i.updatedAt);
    // Skips rows edited since they were read (they stay stale and are picked up next time).
    await prisma.$executeRaw`
      UPDATE "menu_items" m SET "searchName" = v.n, "searchText" = v.t, "searchedAt" = now()
      FROM unnest(${ids}::text[], ${names}::text[], ${texts}::text[], ${stamps}::timestamp[]) AS v(id, n, t, u)
      WHERE m."id" = v.id AND m."searchedAt" IS NULL AND m."updatedAt" = v.u`;
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { searchedAt: null },
    take: Math.max(50, Math.floor(limit / 4)),
    select: {
      id: true,
      displayName: true,
      cuisine: true,
      area: true,
      city: true,
      description: true,
      updatedAt: true,
      menuItems: { where: { archived: false }, take: 300, orderBy: { ratingCount: "desc" }, select: { name: true, foodCategory: { select: { name: true, nameAr: true } }, menuCategory: { select: { name: true } } } },
    },
  });
  if (restaurants.length) {
    const ids = restaurants.map((r) => r.id);
    const names = restaurants.map((r) => norm(r.displayName));
    const texts = restaurants.map((r) => {
      const cats = new Set(r.menuItems.flatMap((m) => [m.foodCategory?.name, m.foodCategory?.nameAr, m.menuCategory?.name]).filter(Boolean) as string[]);
      const dishes = new Set(r.menuItems.flatMap((m) => norm(m.name).split(" ")));
      return join(r.displayName, r.cuisine, r.area, r.city, [...cats].join(" "), [...dishes].join(" "), r.description);
    });
    const stamps = restaurants.map((r) => r.updatedAt);
    await prisma.$executeRaw`
      UPDATE "restaurants" r SET "searchName" = v.n, "searchText" = v.t, "searchedAt" = now()
      FROM unnest(${ids}::text[], ${names}::text[], ${texts}::text[], ${stamps}::timestamp[]) AS v(id, n, t, u)
      WHERE r."id" = v.id AND r."searchedAt" IS NULL AND r."updatedAt" = v.u`;
  }
  if (items.length || restaurants.length) refreshWords();
  return { items: items.length, restaurants: restaurants.length };
}

let wordsAt = 0;
let wordsRunning = false;
/** The spelling dictionary (search_words) follows the search text, rebuilt at most once a minute. */
export async function refreshWords(force = false) {
  if (wordsRunning || (!force && Date.now() - wordsAt < 60_000)) return;
  wordsRunning = true;
  wordsAt = Date.now();
  try {
    await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY "search_words"');
  } catch (e) {
    console.error("[search] words refresh failed", e);
  } finally {
    wordsRunning = false;
  }
}

/** Rebuilds everything that's stale (deploy/seed, cron). */
export async function refreshAllSearchText() {
  const total = { items: 0, restaurants: 0 };
  for (let i = 0; i < 200; i++) {
    const r = await refreshSearchText(2000);
    total.items += r.items;
    total.restaurants += r.restaurants;
    if (!r.items && !r.restaurants) break;
  }
  await refreshWords(true);
  return total;
}

let lastRun = 0;
let running: Promise<unknown> | null = null;
/** Called by searches: a cheap background top-up at most every 10 s, so edits show up within seconds. */
export function topUpSearchText() {
  if (running || Date.now() - lastRun < 10_000) return;
  lastRun = Date.now();
  running = refreshSearchText(500)
    .catch((e) => console.error("[search] refresh failed", e))
    .finally(() => {
      running = null;
    });
}
