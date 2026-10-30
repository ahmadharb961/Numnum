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
  return {
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
