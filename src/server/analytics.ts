import "server-only";
import { prisma } from "./db";

export async function restaurantOverview(restaurantId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const [reelAgg, itemViews, events, byStatus, sales, commission, topItems, topReels, restaurant, avgAccept] = await Promise.all([
    prisma.reel.aggregate({ where: { restaurantId }, _sum: { viewCount: true, likeCount: true, shareCount: true, productOpens: true, addToCarts: true, orderInits: true } }),
    prisma.menuItem.aggregate({ where: { restaurantId }, _sum: { viewCount: true } }),
    prisma.analyticsEvent.groupBy({ by: ["type"], where: { restaurantId, createdAt: { gte: since } }, _count: true }),
    prisma.order.groupBy({ by: ["status"], where: { restaurantId, createdAt: { gte: since } }, _count: true }),
    prisma.order.aggregate({ where: { restaurantId, status: "COMPLETED", createdAt: { gte: since } }, _sum: { totalCents: true, subtotalCents: true } }),
    prisma.commissionEvent.aggregate({ where: { restaurantId, createdAt: { gte: since }, status: { in: ["ACCRUED", "INVOICED", "DISPUTED"] } }, _sum: { commissionCents: true, baseCents: true }, _count: true }),
    prisma.orderItem.groupBy({ by: ["menuItemId", "name"], where: { order: { restaurantId, status: "COMPLETED", createdAt: { gte: since } } }, _sum: { quantity: true, lineTotalCents: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
    prisma.reel.findMany({ where: { restaurantId, visibility: "PUBLISHED" }, orderBy: { viewCount: "desc" }, take: 5, select: { id: true, posterUrl: true, viewCount: true, likeCount: true, orderInits: true, menuItem: { select: { name: true } } } }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { ratingAvg: true, ratingCount: true, currency: true } }),
    prisma.$queryRaw<{ m: number | null }[]>`SELECT AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "createdAt")) / 60)::float AS m FROM orders WHERE "restaurantId" = ${restaurantId} AND "acceptedAt" IS NOT NULL AND "createdAt" >= ${since}`,
  ]);
  const ev = (t: string) => events.find((e) => e.type === t)?._count ?? 0;
  const st = (...s: string[]) => byStatus.filter((b) => s.includes(b.status)).reduce((n, b) => n + b._count, 0);
  return {
    totals: { reelViews: reelAgg._sum.viewCount ?? 0, likes: reelAgg._sum.likeCount ?? 0, shares: reelAgg._sum.shareCount ?? 0, itemViews: itemViews._sum.viewCount ?? 0 },
    period: {
      days,
      productOpens: ev("product_opened"),
      addToCarts: ev("add_to_cart"),
      placed: st("PLACED", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "COMPLETED", "REJECTED", "CANCELED", "FAILED"),
      completed: st("COMPLETED"),
      rejected: st("REJECTED"),
      canceled: st("CANCELED"),
      failed: st("FAILED"),
      salesCents: sales._sum.totalCents ?? 0,
      avgAcceptMinutes: avgAccept[0]?.m ?? null,
      commissionable: commission._count,
      commissionCents: commission._sum.commissionCents ?? 0,
      commissionableSubtotalCents: commission._sum.baseCents ?? 0,
    },
    rating: restaurant,
    topItems,
    topReels,
  };
}

/** Restaurants whose rejection / failed-delivery pattern deserves admin review (last 30 days, min 5 orders). */
export async function suspiciousRestaurants(threshold: number) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const rows = await prisma.order.groupBy({ by: ["restaurantId", "status"], where: { createdAt: { gte: since } }, _count: true });
  const by = new Map<string, { total: number; rejected: number; failed: number }>();
  for (const r of rows) {
    const m = by.get(r.restaurantId) ?? { total: 0, rejected: 0, failed: 0 };
    if (r.status === "CANCELED") continue; // customer cancellations don't count against restaurants
    m.total += r._count;
    if (r.status === "REJECTED") m.rejected += r._count;
    if (r.status === "FAILED") m.failed += r._count;
    by.set(r.restaurantId, m);
  }
  const flagged = [...by.entries()].filter(([, m]) => m.total >= 5 && (m.rejected + m.failed) / m.total >= threshold);
  const names = await prisma.restaurant.findMany({ where: { id: { in: flagged.map(([id]) => id) } }, select: { id: true, displayName: true } });
  return flagged.map(([id, m]) => ({ id, name: names.find((n) => n.id === id)?.displayName ?? id, ...m, rate: (m.rejected + m.failed) / m.total }));
}
