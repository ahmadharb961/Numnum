import "server-only";
import type { ReviewEvidence } from "@prisma/client";
import { prisma } from "./db";
import { notifyRestaurant } from "./notifications";
import { rateLimit } from "./rate-limit";
import type { CurrentUser } from "./auth";

export class ReviewError extends Error {
  status = 400;
}

async function evidenceFor(user: CurrentUser, restaurantId: string, reference: string | null | undefined, menuItemId?: string): Promise<{ evidence: ReviewEvidence; orderId: string | null }> {
  if (!reference || !user.phone) return { evidence: "UNVERIFIED", orderId: null };
  const order = await prisma.order.findFirst({ where: { reference: reference.trim().toUpperCase(), restaurantId, customerPhone: user.phone }, include: { items: { select: { menuItemId: true } } } });
  if (!order) throw new ReviewError("We couldn't match that order reference to your phone number");
  if (menuItemId && !order.items.some((i) => i.menuItemId === menuItemId)) throw new ReviewError("That order doesn't include this item");
  // Only restaurant-confirmed orders count as evidence; never label as verified purchase otherwise.
  if (order.fulfilledAt) return { evidence: "FULFILLED_ORDER", orderId: order.id };
  if (order.acknowledgedAt) return { evidence: "ACKNOWLEDGED_ORDER", orderId: order.id };
  return { evidence: "UNVERIFIED", orderId: order.id };
}

function checkLimits(userId: string) {
  if (!rateLimit(`review:${userId}`, 10, 86400_000).ok) throw new ReviewError("You've reached today's review limit");
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
  await notifyRestaurant(item.restaurantId, { type: "NEW_REVIEW", title: `New ${input.rating}★ review on ${item.name}`, body: body?.slice(0, 120), link: "/dashboard/reviews" });
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
  await notifyRestaurant(r.id, { type: "NEW_REVIEW", title: `New ${input.rating}★ restaurant review`, body: body?.slice(0, 120), link: "/dashboard/reviews" });
  return review;
}

export function evidenceLabel(e: ReviewEvidence): string | null {
  if (e === "FULFILLED_ORDER") return "Ordered via numnum · fulfilled";
  if (e === "ACKNOWLEDGED_ORDER") return "Ordered via numnum";
  return null;
}
