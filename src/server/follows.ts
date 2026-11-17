import "server-only";
import { prisma } from "./db";
import { pushInLanguages } from "./push";
import { formatMoney } from "@/lib/money";
import { dealText } from "@/lib/deals";
import { encodeText } from "@/lib/notification-text";
import { attachDeals, publicReelWhere, reelCardSelect, toPublicReel } from "./feed";

// Following a restaurant: its new reels and deals show in the "Following" feed and reach the
// customer as a notification — at most one per restaurant per NOTIFY_GAP, so a busy restaurant
// can't flood anyone.

const NOTIFY_GAP_MS = 20 * 3600_000;
const BATCH = 500;

/** Follow or unfollow; keeps the restaurant's follower count in step. Returns the new state. */
export async function setFollow(userId: string, restaurantId: string, follow: boolean): Promise<{ following: boolean; followerCount: number }> {
  return prisma.$transaction(async (tx) => {
    const r = await tx.restaurant.findFirst({ where: { id: restaurantId, status: "ACTIVE" }, select: { id: true } });
    if (!r) throw new Error("Restaurant not found");
    const existing = await tx.restaurantFollow.findUnique({ where: { userId_restaurantId: { userId, restaurantId } } });
    if (follow && !existing) {
      await tx.restaurantFollow.create({ data: { userId, restaurantId } });
      await tx.restaurant.update({ where: { id: restaurantId }, data: { followerCount: { increment: 1 } } });
    } else if (!follow && existing) {
      await tx.restaurantFollow.delete({ where: { userId_restaurantId: { userId, restaurantId } } });
      await tx.restaurant.updateMany({ where: { id: restaurantId, followerCount: { gt: 0 } }, data: { followerCount: { decrement: 1 } } });
    }
    const { followerCount } = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { followerCount: true } });
    return { following: follow, followerCount };
  });
}

export async function followedRestaurantIds(userId: string | null | undefined, restaurantIds?: string[]): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await prisma.restaurantFollow.findMany({ where: { userId, ...(restaurantIds ? { restaurantId: { in: restaurantIds } } : {}) }, select: { restaurantId: true } });
  return new Set(rows.map((r) => r.restaurantId));
}

/** The "Following" feed: newest reels from restaurants the customer follows. */
export async function followingFeed(userId: string, opts: { cursor?: number; limit?: number; blockedRestaurantIds?: string[] } = {}) {
  const limit = Math.min(opts.limit ?? 8, 20);
  const cursor = opts.cursor ?? 0;
  const rows = await prisma.reel.findMany({
    // Restaurants they follow (their own reels and creator reels on their dishes) and creators they follow.
    where: {
      ...publicReelWhere,
      restaurant: { ...(publicReelWhere.restaurant as object), ...(opts.blockedRestaurantIds?.length ? { id: { notIn: opts.blockedRestaurantIds } } : {}) },
      OR: [{ restaurant: { followers: { some: { userId } } } }, { creator: { followers: { some: { userId } } } }],
    },
    select: reelCardSelect,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    skip: cursor,
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return { reels: await attachDeals(page.map((r) => toPublicReel(r))), nextCursor: rows.length > limit ? cursor + limit : null };
}

type Event = { kind: "reel"; reelId: string } | { kind: "deal"; dealId: string };

/** Tells followers about a new reel or deal (in-app + push, in each person's language). Never throws. */
export async function notifyFollowers(restaurantId: string, ev: Event) {
  try {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { displayName: true, slug: true, currency: true, status: true } });
    if (!r || r.status !== "ACTIVE") return 0;
    let title: { k: string; v: Record<string, string | number> };
    let body: { k: string; v: Record<string, string | number> } | null = null;
    let link: string;
    let image: string | undefined;
    if (ev.kind === "reel") {
      const reel = await prisma.reel.findUnique({ where: { id: ev.reelId }, select: { id: true, posterUrl: true, menuItem: { select: { name: true, priceCents: true, currency: true } } } });
      if (!reel) return 0;
      title = { k: "{name} posted a new reel", v: { name: r.displayName } };
      body = { k: "{dish} · {price}", v: { dish: reel.menuItem.name, price: formatMoney(reel.menuItem.priceCents, reel.menuItem.currency) } };
      link = `/reel/${reel.id}`;
      image = reel.posterUrl ?? undefined;
    } else {
      const deal = await prisma.deal.findUnique({ where: { id: ev.dealId }, include: { menuItem: { select: { name: true } } } });
      if (!deal) return 0;
      title = { k: "New deal at {name}", v: { name: r.displayName } };
      body = dealText(deal, r.currency, deal.menuItem?.name);
      link = `/r/${r.slug}`;
    }
    const since = new Date(Date.now() - NOTIFY_GAP_MS);
    // In batches (by user id), so a restaurant with 100,000 followers never loads or pushes to them
    // all at once: each batch is marked, gets its in-app notifications, then its pushes.
    let total = 0;
    let after: string | undefined;
    for (;;) {
      const followers = await prisma.restaurantFollow.findMany({
        where: { restaurantId, OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: since } }], user: { disabled: false }, ...(after ? { userId: { gt: after } } : {}) },
        select: { userId: true, user: { select: { locale: true } } },
        orderBy: { userId: "asc" },
        take: BATCH,
      });
      if (!followers.length) break;
      after = followers[followers.length - 1].userId;
      const ids = followers.map((f) => f.userId);
      await prisma.restaurantFollow.updateMany({ where: { restaurantId, userId: { in: ids } }, data: { lastNotifiedAt: new Date() } });
      await prisma.notification.createMany({ data: ids.map((userId) => ({ audience: "USER", userId, type: `follow_${ev.kind}`, title: encodeText(title), body: body ? encodeText(body) : null, link, imageUrl: image ?? null })) });
      await pushInLanguages(
        followers.map((f) => ({ id: f.userId, locale: f.user.locale })),
        (t) => ({ title: t(title.k, title.v), body: body ? t(body.k, body.v) : "", url: link, tag: `follow-${restaurantId}`, image }),
      );
      total += ids.length;
      if (followers.length < BATCH) break;
    }
    return total;
  } catch (e) {
    console.error("notifyFollowers", e);
    return 0;
  }
}
