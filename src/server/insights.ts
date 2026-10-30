import "server-only";
import { prisma } from "./db";

export type InsightsRange = { from: Date; to: Date; label: string };

/** Parses ?days=7|30|90 or ?from=YYYY-MM-DD&to=YYYY-MM-DD (Beirut-agnostic UTC days). */
export function parseRange(sp: { days?: string; from?: string; to?: string }): InsightsRange {
  const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
  const f = day(sp.from), t = day(sp.to);
  if (f && t && f <= t && t.getTime() - f.getTime() <= 366 * 86400_000) return { from: f, to: new Date(t.getTime() + 86400_000), label: `${sp.from} → ${sp.to}` };
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const end = new Date();
  end.setUTCHours(24, 0, 0, 0);
  return { from: new Date(end.getTime() - days * 86400_000), to: end, label: `Last ${days} days` };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function restaurantInsights(restaurantId: string, range: InsightsRange) {
  const created = { gte: range.from, lt: range.to };
  const [restaurant, events, visitors, reelViews, byStatus, completed, commission, topItemsRaw, reelViewsByReel, orders] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { displayName: true, currency: true, ratingAvg: true, ratingCount: true } }),
    prisma.analyticsEvent.groupBy({ by: ["type"], where: { restaurantId, createdAt: created }, _count: true }),
    prisma.analyticsEvent.findMany({ where: { restaurantId, type: "restaurant_opened", createdAt: created, deviceKey: { not: null } }, select: { deviceKey: true }, distinct: ["deviceKey"] }),
    prisma.reelView.count({ where: { reel: { restaurantId }, createdAt: created } }),
    prisma.order.groupBy({ by: ["status"], where: { restaurantId, createdAt: created }, _count: true }),
    prisma.order.aggregate({ where: { restaurantId, status: "COMPLETED", createdAt: created }, _sum: { totalCents: true, subtotalCents: true, deliveryFeeCents: true }, _count: true }),
    prisma.commissionEvent.aggregate({ where: { restaurantId, createdAt: created, status: { not: "VOIDED" } }, _sum: { commissionCents: true } }),
    prisma.orderItem.groupBy({ by: ["menuItemId", "name"], where: { order: { restaurantId, status: "COMPLETED", createdAt: created } }, _sum: { quantity: true, lineTotalCents: true }, orderBy: { _sum: { quantity: "desc" } }, take: 10 }),
    prisma.reelView.groupBy({ by: ["reelId"], where: { reel: { restaurantId }, createdAt: created }, _count: true, orderBy: { _count: { reelId: "desc" } }, take: 5 }),
    prisma.order.findMany({ where: { restaurantId, createdAt: created }, orderBy: { createdAt: "desc" }, take: 1000, select: { reference: true, createdAt: true, status: true, fulfillment: true, customerName: true, totalCents: true, subtotalCents: true, deliveryFeeCents: true, items: { select: { quantity: true } } } }),
  ]);
  const ev = (t: string) => events.find((e) => e.type === t)?._count ?? 0;
  const st = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const placed = byStatus.reduce((n, b) => n + b._count, 0);

  const reels = await prisma.reel.findMany({ where: { id: { in: reelViewsByReel.map((r) => r.reelId) } }, select: { id: true, posterUrl: true, likeCount: true, shareCount: true, orderInits: true, menuItem: { select: { name: true } } } });
  const topReels = reelViewsByReel.map((r) => ({ ...reels.find((x) => x.id === r.reelId)!, views: r._count })).filter((r) => r.id);

  // Daily series (one entry per day in range)
  const visitsDaily = await prisma.$queryRaw<{ d: Date; n: bigint }[]>`SELECT date_trunc('day', "createdAt") AS d, COUNT(*) AS n FROM analytics_events WHERE "restaurantId" = ${restaurantId} AND type = 'restaurant_opened' AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} GROUP BY 1`;
  const viewsDaily = await prisma.$queryRaw<{ d: Date; n: bigint }[]>`SELECT date_trunc('day', v."createdAt") AS d, COUNT(*) AS n FROM reel_views v JOIN reels r ON r.id = v."reelId" WHERE r."restaurantId" = ${restaurantId} AND v."createdAt" >= ${range.from} AND v."createdAt" < ${range.to} GROUP BY 1`;
  const days: { date: string; visits: number; reelViews: number; orders: number; revenueCents: number }[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime(); t += 86400_000) days.push({ date: dayKey(new Date(t)), visits: 0, reelViews: 0, orders: 0, revenueCents: 0 });
  const at = (d: Date) => days.find((x) => x.date === dayKey(d));
  for (const r of visitsDaily) { const x = at(r.d); if (x) x.visits = Number(r.n); }
  for (const r of viewsDaily) { const x = at(r.d); if (x) x.reelViews = Number(r.n); }
  for (const o of orders) {
    const x = at(o.createdAt);
    if (!x) continue;
    x.orders++;
    if (o.status === "COMPLETED") x.revenueCents += o.totalCents;
  }

  const visits = ev("restaurant_opened");
  const reelsPerf = await reelsPerformance(restaurantId, range);
  return {
    reels: reelsPerf,
    restaurant,
    range,
    kpis: {
      profileVisits: visits,
      uniqueVisitors: visitors.length,
      reelViews,
      dishViews: ev("product_opened"),
      addToCarts: ev("add_to_cart"),
      ordersPlaced: placed,
      ordersCompleted: st("COMPLETED"),
      ordersRejected: st("REJECTED"),
      ordersCanceled: st("CANCELED"),
      ordersFailed: st("FAILED"),
      revenueCents: completed._sum.totalCents ?? 0,
      itemSalesCents: completed._sum.subtotalCents ?? 0,
      deliveryFeesCents: completed._sum.deliveryFeeCents ?? 0,
      avgOrderCents: completed._count ? Math.round((completed._sum.totalCents ?? 0) / completed._count) : 0,
      commissionCents: commission._sum.commissionCents ?? 0,
      conversion: visits ? placed / visits : null,
    },
    days,
    topReels,
    topItems: topItemsRaw.map((t) => ({ name: t.name, quantity: t._sum.quantity ?? 0, salesCents: t._sum.lineTotalCents ?? 0 })),
    orders: orders.map((o) => ({ reference: o.reference, createdAt: o.createdAt.toISOString(), status: o.status, fulfillment: o.fulfillment, customer: o.customerName.split(" ")[0], items: o.items.reduce((n, i) => n + i.quantity, 0), subtotalCents: o.subtotalCents, deliveryFeeCents: o.deliveryFeeCents, totalCents: o.totalCents })),
  };
}

export type Insights = Awaited<ReturnType<typeof restaurantInsights>>;

export type ReelPerf = {
  id: string;
  name: string;
  posterUrl: string | null;
  visibility: string;
  publishedAt: string | null;
  views: number;
  uniqueViewers: number;
  avgWatchSec: number | null;
  likes: number;
  shares: number;
  productOpens: number;
  addToCarts: number;
  orders: number;
  completedOrders: number;
  revenueCents: number;
  conversion: number | null; // orders per view
};

/** Per-reel performance in a date range: views, engagement, funnel and the orders/revenue attributed to it. */
export async function reelsPerformance(restaurantId: string, range: InsightsRange, onlyReelId?: string): Promise<ReelPerf[]> {
  const reels = await prisma.reel.findMany({
    where: { restaurantId, ...(onlyReelId ? { id: onlyReelId } : { visibility: { in: ["PUBLISHED", "UNPUBLISHED"] } }) },
    select: { id: true, posterUrl: true, visibility: true, publishedAt: true, menuItem: { select: { name: true } } },
  });
  if (!reels.length) return [];
  const ids = reels.map((r) => r.id);
  const [views, events, likes, attributed] = await Promise.all([
    prisma.$queryRaw<{ reelId: string; views: bigint; uniq: bigint; watch: number | null }[]>`
      SELECT "reelId", COUNT(*) AS views, COUNT(DISTINCT "viewerKey") AS uniq, AVG("watchMs")::float AS watch
      FROM reel_views WHERE "reelId" = ANY(${ids}) AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} GROUP BY "reelId"`,
    prisma.analyticsEvent.groupBy({ by: ["reelId", "type"], where: { reelId: { in: ids }, createdAt: { gte: range.from, lt: range.to }, type: { in: ["reel_shared", "product_opened", "add_to_cart"] } }, _count: true }),
    prisma.reelLike.groupBy({ by: ["reelId"], where: { reelId: { in: ids }, createdAt: { gte: range.from, lt: range.to } }, _count: true }),
    prisma.$queryRaw<{ reelId: string; orders: bigint; completed: bigint; revenue: bigint | null }[]>`
      SELECT rid AS "reelId", COUNT(o.id) AS orders, COUNT(o.id) FILTER (WHERE o.status = 'COMPLETED') AS completed, SUM(o."totalCents") FILTER (WHERE o.status = 'COMPLETED') AS revenue
      FROM analytics_events e CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e.data->'reelIds', '[]'::jsonb)) AS rid
      JOIN orders o ON o.id = e."orderId"
      WHERE e.type = 'order_placed' AND e."restaurantId" = ${restaurantId} AND e."createdAt" >= ${range.from} AND e."createdAt" < ${range.to} AND rid = ANY(${ids})
      GROUP BY rid`,
  ]);
  const ev = (id: string, t: string) => events.find((e) => e.reelId === id && e.type === t)?._count ?? 0;
  return reels
    .map((r) => {
      const v = views.find((x) => x.reelId === r.id);
      const a = attributed.find((x) => x.reelId === r.id);
      const nViews = Number(v?.views ?? 0);
      const orders = Number(a?.orders ?? 0);
      return {
        id: r.id,
        name: r.menuItem.name,
        posterUrl: r.posterUrl,
        visibility: r.visibility,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        views: nViews,
        uniqueViewers: Number(v?.uniq ?? 0),
        avgWatchSec: v?.watch != null ? Math.round(v.watch / 100) / 10 : null,
        likes: likes.find((l) => l.reelId === r.id)?._count ?? 0,
        shares: ev(r.id, "reel_shared"),
        productOpens: ev(r.id, "product_opened"),
        addToCarts: ev(r.id, "add_to_cart"),
        orders,
        completedOrders: Number(a?.completed ?? 0),
        revenueCents: Number(a?.revenue ?? 0),
        conversion: nViews ? orders / nViews : null,
      };
    })
    .sort((x, y) => y.views - x.views);
}

/** One reel: totals for the range, its daily trend, and the restaurant's per-reel average for comparison. */
export async function reelInsight(restaurantId: string, reelId: string, range: InsightsRange) {
  const [mine] = await reelsPerformance(restaurantId, range, reelId);
  const all = await reelsPerformance(restaurantId, range);
  const avg = (k: keyof ReelPerf) => (all.length ? all.reduce((s, r) => s + (Number(r[k]) || 0), 0) / all.length : 0);
  const rank = all.findIndex((r) => r.id === reelId) + 1;
  const daily = await prisma.$queryRaw<{ d: Date; views: bigint }[]>`SELECT date_trunc('day', "createdAt") AS d, COUNT(*) AS views FROM reel_views WHERE "reelId" = ${reelId} AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} GROUP BY 1`;
  const dailyEv = await prisma.$queryRaw<{ d: Date; type: string; n: bigint }[]>`SELECT date_trunc('day', "createdAt") AS d, type, COUNT(*) AS n FROM analytics_events WHERE "reelId" = ${reelId} AND type IN ('product_opened', 'add_to_cart') AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} GROUP BY 1, 2`;
  const dailyOrders = await prisma.$queryRaw<{ d: Date; n: bigint; revenue: bigint | null }[]>`
    SELECT date_trunc('day', e."createdAt") AS d, COUNT(o.id) AS n, SUM(o."totalCents") FILTER (WHERE o.status = 'COMPLETED') AS revenue
    FROM analytics_events e JOIN orders o ON o.id = e."orderId"
    WHERE e.type = 'order_placed' AND e."restaurantId" = ${restaurantId} AND COALESCE(e.data->'reelIds', '[]'::jsonb) ? ${reelId} AND e."createdAt" >= ${range.from} AND e."createdAt" < ${range.to}
    GROUP BY 1`;
  const days: { date: string; views: number; opens: number; addToCarts: number; orders: number; revenueCents: number }[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime(); t += 86400_000) days.push({ date: dayKey(new Date(t)), views: 0, opens: 0, addToCarts: 0, orders: 0, revenueCents: 0 });
  const at = (d: Date) => days.find((x) => x.date === dayKey(d));
  for (const r of daily) { const x = at(r.d); if (x) x.views = Number(r.views); }
  for (const r of dailyEv) { const x = at(r.d); if (x) { if (r.type === "product_opened") x.opens = Number(r.n); else x.addToCarts = Number(r.n); } }
  for (const r of dailyOrders) { const x = at(r.d); if (x) { x.orders = Number(r.n); x.revenueCents = Number(r.revenue ?? 0); } }
  return { reel: mine ?? null, days, rank, reelCount: all.length, average: { views: avg("views"), orders: avg("orders"), likes: avg("likes") } };
}
