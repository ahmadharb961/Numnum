import "server-only";
import type { ReviewEvidence } from "@prisma/client";
import { prisma } from "./db";
import { notifyRestaurant } from "./notifications";
import { rateLimit } from "./rate-limit";
import type { CurrentUser } from "./auth";

export class ReviewError extends Error {
  status = 400;
}

/**
 * Evidence a review is from a real customer: the reviewer's own orders (by account,
 * or by an order reference placed with their phone). Never labeled as verified otherwise.
 */
async function evidenceFor(user: CurrentUser, restaurantId: string, reference: string | null | undefined, menuItemId?: string): Promise<{ evidence: ReviewEvidence; orderId: string | null }> {
  const mine = { OR: [{ userId: user.id }, ...(user.phone ? [{ customerPhone: user.phone }] : [])] };
  const where = { restaurantId, ...mine, ...(menuItemId ? { items: { some: { menuItemId } } } : {}) };
  if (reference) {
    const order = await prisma.order.findFirst({ where: { ...where, reference: reference.trim().toUpperCase() } });
    if (!order) throw new ReviewError("We couldn't match that order reference to your account or phone number");
  }
  const completed = await prisma.order.findFirst({ where: { ...where, status: "COMPLETED", ...(reference ? { reference: reference.trim().toUpperCase() } : {}) }, orderBy: { createdAt: "desc" } });
  if (completed) return { evidence: "COMPLETED_ORDER", orderId: completed.id };
  const accepted = await prisma.order.findFirst({ where: { ...where, acceptedAt: { not: null }, status: { notIn: ["CANCELED", "REJECTED"] }, ...(reference ? { reference: reference.trim().toUpperCase() } : {}) }, orderBy: { createdAt: "desc" } });
  if (accepted) return { evidence: "ACCEPTED_ORDER", orderId: accepted.id };
  return { evidence: "UNVERIFIED", orderId: null };
}

function checkLimits(userId: string) {
  if (!rateLimit(`review:${userId}`, 30, 86400_000).ok) throw new ReviewError("You've reached today's review limit");
}

function cleanBody(body?: string | null) {
  const b = body?.trim() ?? "";
  if (b.length > 1500) throw new ReviewError("Reviews must be under 1500 characters");
  if (/(https?:\/\/|www\.)/i.test(b)) throw new ReviewError("Links aren't allowed in reviews");
  return b || null;
}

export async function recomputeItemRating(menuItemId: string) {
  const agg = await prisma.itemReview.aggregate({ where: { menuItemId, status: "VISIBLE" }, _avg: { rating: true }, _count: true });
  await prisma.menuItem.update({ where: { id: menuItemId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count } });
}

export async function recomputeRestaurantRating(restaurantId: string) {
  const agg = await prisma.restaurantReview.aggregate({ where: { restaurantId, status: "VISIBLE" }, _avg: { rating: true }, _count: true });
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count } });
}

export async function submitItemReview(user: CurrentUser, input: { menuItemId: string; rating: number; body?: string | null; photoUrl?: string | null; orderReference?: string | null }) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ReviewError("Choose a rating from 1 to 5");
  const item = await prisma.menuItem.findFirst({ where: { id: input.menuItemId, archived: false }, select: { id: true, restaurantId: true, name: true } });
  if (!item) throw new ReviewError("Item not found");
  const staff = await prisma.restaurantStaff.findFirst({ where: { userId: user.id, restaurantId: item.restaurantId } });
  if (staff) throw new ReviewError("Restaurant staff can't review their own menu");
  checkLimits(user.id);
  const body = cleanBody(input.body);
  const ev = await evidenceFor(user, item.restaurantId, input.orderReference, item.id);
  const review = await prisma.itemReview.upsert({
    where: { menuItemId_userId: { menuItemId: item.id, userId: user.id } },
    create: { menuItemId: item.id, restaurantId: item.restaurantId, userId: user.id, rating: input.rating, body, photoUrl: input.photoUrl ?? null, evidence: ev.evidence, orderId: ev.orderId },
    update: { rating: input.rating, body, photoUrl: input.photoUrl ?? undefined, evidence: ev.evidence, orderId: ev.orderId },
  });
  await recomputeItemRating(item.id);
  await notifyRestaurant(item.restaurantId, { type: "NEW_REVIEW", title: { k: "New {n}★ review on {name}", v: { n: input.rating, name: item.name } }, body: body?.slice(0, 120), link: "/dashboard/reviews" });
  return review;
}

export async function submitRestaurantReview(user: CurrentUser, input: { restaurantId: string; rating: number; foodQuality?: number | null; service?: number | null; value?: number | null; delivery?: number | null; body?: string | null; orderReference?: string | null }) {
  const stars = [input.rating, input.foodQuality, input.service, input.value, input.delivery].filter((x) => x != null) as number[];
  if (stars.some((s) => !Number.isInteger(s) || s < 1 || s > 5)) throw new ReviewError("Ratings must be from 1 to 5");
  const r = await prisma.restaurant.findFirst({ where: { id: input.restaurantId, status: "ACTIVE" }, select: { id: true } });
  if (!r) throw new ReviewError("Restaurant not found");
  const staff = await prisma.restaurantStaff.findFirst({ where: { userId: user.id, restaurantId: r.id } });
  if (staff) throw new ReviewError("You can't review your own restaurant");
  checkLimits(user.id);
  const body = cleanBody(input.body);
  const ev = await evidenceFor(user, r.id, input.orderReference);
  const data = { rating: input.rating, foodQuality: input.foodQuality ?? null, service: input.service ?? null, value: input.value ?? null, delivery: input.delivery ?? null, body, evidence: ev.evidence, orderId: ev.orderId };
  const review = await prisma.restaurantReview.upsert({
    where: { restaurantId_userId: { restaurantId: r.id, userId: user.id } },
    create: { restaurantId: r.id, userId: user.id, ...data },
    update: data,
  });
  await recomputeRestaurantRating(r.id);
  await notifyRestaurant(r.id, { type: "NEW_REVIEW", title: { k: "New {n}★ restaurant review", v: { n: input.rating } }, body: body?.slice(0, 120), link: "/dashboard/reviews" });
  return review;
}

export function evidenceLabel(e: ReviewEvidence): string | null {
  if (e === "COMPLETED_ORDER") return "Verified order";
  if (e === "ACCEPTED_ORDER") return "Ordered on numnum";
  return null;
}

/** The most recent delivered order (last 14 days) the customer hasn't rated or dismissed. */
export async function pendingOrderReview(userId: string) {
  const order = await prisma.order.findFirst({
    where: { userId, status: "COMPLETED", reviewedAt: null, reviewDismissedAt: null, completedAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
    orderBy: { completedAt: "desc" },
    include: { items: { select: { menuItemId: true, name: true } }, restaurant: { select: { id: true, displayName: true, logoUrl: true, slug: true } } },
  });
  if (!order) return null;
  const ids = Array.from(new Set(order.items.map((i) => i.menuItemId).filter(Boolean))) as string[];
  const images = await prisma.menuItemImage.findMany({ where: { menuItemId: { in: ids } }, orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], include: { asset: { select: { thumbUrl: true, url: true } } } });
  const items = ids.map((id) => ({ menuItemId: id, name: order.items.find((i) => i.menuItemId === id)!.name, imageUrl: images.find((im) => im.menuItemId === id)?.asset.thumbUrl ?? null }));
  return { reference: order.reference, fulfillment: order.fulfillment, restaurant: order.restaurant, items };
}

/** Saves the post-delivery ratings for one order (dishes + restaurant), linked as a verified order. */
export async function submitOrderReview(
  user: CurrentUser,
  reference: string,
  input: { restaurant?: { rating: number; foodQuality?: number | null; service?: number | null; value?: number | null; delivery?: number | null; body?: string | null } | null; items: { menuItemId: string; rating: number; body?: string | null }[] },
) {
  const order = await prisma.order.findFirst({ where: { reference, userId: user.id }, include: { items: { select: { menuItemId: true } } } });
  if (!order) throw new ReviewError("Order not found");
  if (order.status !== "COMPLETED") throw new ReviewError("You can rate an order once it's delivered");
  const allowed = new Set(order.items.map((i) => i.menuItemId));
  const items = input.items.filter((i) => allowed.has(i.menuItemId) && i.rating >= 1).slice(0, 20);
  if (!items.length && !input.restaurant) throw new ReviewError("Tap the stars to rate");
  for (const it of items) await submitItemReview(user, { menuItemId: it.menuItemId, rating: it.rating, body: it.body ?? null, orderReference: reference });
  if (input.restaurant) await submitRestaurantReview(user, { restaurantId: order.restaurantId, ...input.restaurant, orderReference: reference });
  await prisma.order.update({ where: { id: order.id }, data: { reviewedAt: new Date() } });
}
