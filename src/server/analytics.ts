import "server-only";
import { prisma } from "./db";

export async function restaurantOverview(restaurantId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const [reelAgg, itemViews, events, orders, acknowledged, commission, topItems, topReels, restaurant] = await Promise.all([
    prisma.reel.aggregate({ where: { restaurantId }, _sum: { viewCount: true, likeCount: true, shareCount: true, productOpens: true, addToCarts: true, orderInits: true } }),
    prisma.menuItem.aggregate({ where: { restaurantId }, _sum: { viewCount: true } }),
    prisma.analyticsEvent.groupBy({ by: ["type"], where: { restaurantId, createdAt: { gte: since } }, _count: true }),
    prisma.order.count({ where: { restaurantId, createdAt: { gte: since } } }),
    prisma.order.count({ where: { restaurantId, acknowledgedAt: { gte: since } } }),
    prisma.commissionEvent.aggregate({ where: { restaurantId, createdAt: { gte: since }, status: { in: ["ACCRUED", "INVOICED", "DISPUTED"] } }, _sum: { commissionCents: true, baseCents: true }, _count: true }),
    prisma.orderItem.groupBy({ by: ["menuItemId", "name"], where: { order: { restaurantId, acknowledgedAt: { not: null }, createdAt: { gte: since } } }, _sum: { quantity: true, lineTotalCents: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
    prisma.reel.findMany({ where: { restaurantId, visibility: "PUBLISHED" }, orderBy: { viewCount: "desc" }, take: 5, select: { id: true, posterUrl: true, viewCount: true, likeCount: true, orderInits: true, menuItem: { select: { name: true } } } }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { ratingAvg: true, ratingCount: true, currency: true } }),
  ]);
  const ev = (t: string) => events.find((e) => e.type === t)?._count ?? 0;
  return {
    totals: {
      reelViews: reelAgg._sum.viewCount ?? 0,
      likes: reelAgg._sum.likeCount ?? 0,
      shares: reelAgg._sum.shareCount ?? 0,
      itemViews: itemViews._sum.viewCount ?? 0,
    },
    period: {
      days,
      productOpens: ev("product_opened"),
      addToCarts: ev("add_to_cart"),
      linksGenerated: ev("whatsapp_link_generated"),
      whatsappHandoffs: ev("whatsapp_handoff"),
      orderRequests: orders,
      acknowledged,
      commissionable: commission._count,
      commissionCents: commission._sum.commissionCents ?? 0,
      commissionableSubtotalCents: commission._sum.baseCents ?? 0,
    },
    rating: restaurant,
    topItems,
    topReels,
  };
}

/** Restaurants whose rejection / non-acknowledgment pattern deserves admin review. */
export async function suspiciousRestaurants(threshold: number) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const rows = await prisma.order.groupBy({ by: ["restaurantId", "status"], where: { createdAt: { gte: since, lte: new Date(Date.now() - 2 * 86400_000) } }, _count: true });
  const by = new Map<string, { total: number; unacked: number; rejectedPreAck: number }>();
  for (const r of rows) {
    const m = by.get(r.restaurantId) ?? { total: 0, unacked: 0, rejectedPreAck: 0 };
    m.total += r._count;
    if (["LINK_GENERATED", "HANDOFF_ATTEMPTED", "MESSAGE_CONFIRMED"].includes(r.status)) m.unacked += r._count;
    by.set(r.restaurantId, m);
  }
  const rejectedPre = await prisma.order.groupBy({ by: ["restaurantId"], where: { createdAt: { gte: since }, status: "REJECTED", acknowledgedAt: null }, _count: true });
  for (const r of rejectedPre) {
    const m = by.get(r.restaurantId);
    if (m) m.rejectedPreAck = r._count;
  }
  const flagged = [...by.entries()].filter(([, m]) => m.total >= 5 && (m.unacked + m.rejectedPreAck) / m.total >= threshold);
  const names = await prisma.restaurant.findMany({ where: { id: { in: flagged.map(([id]) => id) } }, select: { id: true, displayName: true } });
  return flagged.map(([id, m]) => ({ id, name: names.find((n) => n.id === id)?.displayName ?? id, ...m, rate: (m.unacked + m.rejectedPreAck) / m.total }));
}
