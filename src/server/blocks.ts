import "server-only";
import { cache } from "react";
import { prisma } from "./db";
import { getCurrentUser } from "./auth";

// Blocking (required by the app stores for user content): a customer can hide a restaurant
// (its reels, dishes and page) or a reviewer (their reviews), and undo it from their account.

export type Blocks = { restaurantIds: string[]; userIds: string[] };
const NONE: Blocks = { restaurantIds: [], userIds: [] };

/** What the current visitor has blocked (nothing for guests). Once per request. */
export const getBlocks = cache(async (): Promise<Blocks> => {
  const user = await getCurrentUser();
  if (!user) return NONE;
  const rows = await prisma.userBlock.findMany({ where: { userId: user.id }, select: { restaurantId: true, blockedUserId: true } });
  return {
    restaurantIds: rows.map((r) => r.restaurantId).filter((x): x is string => !!x),
    userIds: rows.map((r) => r.blockedUserId).filter((x): x is string => !!x),
  };
});

export type BlockTarget = { restaurantId: string } | { reviewId: string; reviewType: "ITEM" | "RESTAURANT" };

/** Blocks a restaurant, or the author of a review. Returns what was blocked. */
export async function block(userId: string, target: BlockTarget): Promise<{ kind: "restaurant" | "user"; name: string } | null> {
  if ("restaurantId" in target) {
    const r = await prisma.restaurant.findUnique({ where: { id: target.restaurantId }, select: { id: true, displayName: true } });
    if (!r) return null;
    await prisma.userBlock.upsert({ where: { userId_restaurantId: { userId, restaurantId: r.id } }, create: { userId, restaurantId: r.id }, update: {} });
    return { kind: "restaurant", name: r.displayName };
  }
  const review =
    target.reviewType === "ITEM"
      ? await prisma.itemReview.findUnique({ where: { id: target.reviewId }, select: { userId: true, user: { select: { name: true } } } })
      : await prisma.restaurantReview.findUnique({ where: { id: target.reviewId }, select: { userId: true, user: { select: { name: true } } } });
  if (!review || review.userId === userId) return null;
  await prisma.userBlock.upsert({ where: { userId_blockedUserId: { userId, blockedUserId: review.userId } }, create: { userId, blockedUserId: review.userId }, update: {} });
  return { kind: "user", name: review.user.name.split(" ")[0] };
}

export async function unblock(userId: string, blockId: string) {
  await prisma.userBlock.deleteMany({ where: { id: blockId, userId } });
}

export async function listBlocks(userId: string) {
  const rows = await prisma.userBlock.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, restaurant: { select: { displayName: true, slug: true } }, blockedUser: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, label: r.restaurant?.displayName ?? r.blockedUser?.name.split(" ")[0] ?? "—", kind: r.restaurant ? ("restaurant" as const) : ("user" as const) }));
}

/** The current visitor's block on this restaurant, if any (to show the "you blocked" screen). */
export async function restaurantBlockFor(restaurantId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  return prisma.userBlock.findUnique({ where: { userId_restaurantId: { userId: user.id, restaurantId } }, select: { id: true, restaurant: { select: { displayName: true } } } });
}
