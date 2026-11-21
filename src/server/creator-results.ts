import "server-only";
import { prisma } from "./db";
import { creatorReelsPerformance } from "./insights";
import { getSettings } from "./settings";

// A creator's track record, counted by numnum from real orders placed from their reels: what they
// show restaurants (when they choose to) so a restaurant can trust them, and pay them to tag a dish.

const DAY = 86_400_000;

// Results change slowly and are read often (results page, Find creators): kept for a few minutes.
// On globalThis so every server bundle (pages, actions) shares one copy.
const store = globalThis as typeof globalThis & { __nnCreatorResults?: Map<string, { at: number; v: Promise<unknown> }> };
const memo = <T,>(key: string, ms: number, load: () => Promise<T>): Promise<T> => {
  const m = (store.__nnCreatorResults ??= new Map());
  const hit = m.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as Promise<T>;
  const v = load();
  v.catch(() => m.delete(key));
  if (m.size > 2000) m.delete(m.keys().next().value!);
  m.set(key, { at: Date.now(), v });
  return v;
};
const RESULTS_MS = process.env.NODE_ENV === "test" ? 0 : 5 * 60_000;
const LIST_MS = process.env.NODE_ENV === "test" ? 0 : 10 * 60_000;

export type CreatorResults = Awaited<ReturnType<typeof loadResults>>;

/** All-time results: orders (completed = delivered or picked up), views, order rate, restaurants, sales. */
export function creatorResults(creatorId: string) {
  return memo(`r:${creatorId}`, RESULTS_MS, () => loadResults(creatorId));
}

async function loadResults(creatorId: string) {
  const now = new Date();
  const [reels, settings, creator, last30] = await Promise.all([
    creatorReelsPerformance(creatorId, { from: new Date(0), to: new Date(now.getTime() + 60_000), label: "all" }),
    getSettings(),
    prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { approvedAt: true, createdAt: true, followerCount: true } }),
    creatorReelsPerformance(creatorId, { from: new Date(now.getTime() - 30 * DAY), to: new Date(now.getTime() + 60_000), label: "30" }),
  ]);
  // Sales in dollars (a creator can tag USD and LBP menus); LBP prices are whole pounds.
  const usd = (cents: number, currency: string) => (currency === "LBP" ? Math.round((cents * 100) / settings.lbpPerUsd) : cents);
  const views = reels.reduce((n, r) => n + r.views, 0);
  const completed = reels.reduce((n, r) => n + r.completedOrders, 0);
  const orders = reels.reduce((n, r) => n + r.orders, 0);
  const salesUsdCents = reels.reduce((n, r) => n + usd(r.revenueCents, r.currency), 0);
  const byRestaurant = new Map<string, { name: string; slug: string; reels: number; views: number; completed: number; salesUsdCents: number }>();
  for (const r of reels) {
    const x = byRestaurant.get(r.restaurantSlug) ?? { name: r.restaurantName, slug: r.restaurantSlug, reels: 0, views: 0, completed: 0, salesUsdCents: 0 };
    x.reels++;
    x.views += r.views;
    x.completed += r.completedOrders;
    x.salesUsdCents += usd(r.revenueCents, r.currency);
    byRestaurant.set(r.restaurantSlug, x);
  }
  return {
    totals: {
      completedOrders: completed,
      orders,
      views,
      /** Completed orders for every 1,000 views of their reels. */
      ordersPer1000Views: views ? Math.round((completed / views) * 10_000) / 10 : null,
      salesUsdCents,
      avgOrderUsdCents: completed ? Math.round(salesUsdCents / completed) : null,
      reels: reels.length,
      restaurants: byRestaurant.size,
      followers: creator.followerCount,
      completedLast30: last30.reduce((n, r) => n + r.completedOrders, 0),
    },
    since: (creator.approvedAt ?? creator.createdAt).toISOString(),
    restaurants: [...byRestaurant.values()].sort((a, b) => b.completed - a.completed || b.views - a.views),
    topReels: [...reels]
      .sort((a, b) => b.completedOrders - a.completedOrders || b.views - a.views)
      .slice(0, 6)
      .map((r) => ({ id: r.id, name: r.name, restaurantName: r.restaurantName, posterUrl: r.posterUrl, views: r.views, completed: r.completedOrders, visible: r.visibility === "PUBLISHED" })),
  };
}

/** The latest orders placed from the creator's reels (no customer details: only what was ordered, where and when). */
export async function recentCreatorOrders(creatorId: string, take = 30) {
  const rows = await prisma.$queryRaw<{ id: string; createdAt: Date; status: string; restaurantName: string; totalCents: number; currency: string; dishes: string[] }[]>`
    SELECT o.id, o."createdAt", o.status::text AS status, o."restaurantName", o."totalCents", o.currency, array_agg(DISTINCT m.name) AS dishes
    FROM analytics_events e
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e.data->'reelIds', '[]'::jsonb)) AS rid
    JOIN reels rl ON rl.id = rid
    JOIN menu_items m ON m.id = rl."menuItemId"
    JOIN orders o ON o.id = e."orderId"
    WHERE e.type = 'order_placed' AND rl."creatorId" = ${creatorId}
    GROUP BY o.id
    ORDER BY o."createdAt" DESC
    LIMIT ${take}`;
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Creators sharing their results, best first (Restaurant dashboard → Find creators). */
export function sharingCreators(limit = 60) {
  return memo(`list:${limit}`, LIST_MS, () => loadSharing(limit));
}

async function loadSharing(limit: number) {
  const list = await prisma.creator.findMany({
    where: { status: "APPROVED", shareResults: true },
    select: { id: true, handle: true, displayName: true, avatarUrl: true, area: true, instagram: true, tiktok: true, verification: true, followerCount: true, audienceSize: true },
    take: 300,
  });
  const withResults = await Promise.all(list.map(async (c) => ({ ...c, results: (await creatorResults(c.id)).totals })));
  return withResults.sort((a, b) => b.results.completedOrders - a.results.completedOrders || b.results.views - a.results.views).slice(0, limit);
}

/** After a creator turns sharing on or off: Find creators shows it at once. */
export function clearResultsCache() {
  store.__nnCreatorResults?.clear();
}
