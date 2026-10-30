import { Prisma, type Order } from "@prisma/client";
import { calcCommission } from "@/lib/money";
import { periodOf } from "@/lib/utils";
import type { Tx } from "./db";
import type { BillableEvent, Settings } from "./settings";

/** When has the order reached the configured billable milestone? */
export function reachedBillable(order: Pick<Order, "acceptedAt" | "completedAt">, ev: BillableEvent): Date | null {
  return ev === "ACCEPTED" ? order.acceptedAt : order.completedAt;
}

/**
 * Creates the commission event for an order exactly once. The unique index on
 * commission_events.order_id makes this idempotent even under concurrency.
 * Returns the event when created, null when not billable yet or already exists.
 */
export async function ensureCommission(tx: Tx, orderId: string, settings: Settings) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { restaurant: { select: { commissionRateBps: true } } } });
  const at = reachedBillable(order, settings.billableEvent);
  if (!at) return null;
  if (order.status === "CANCELED" || order.status === "REJECTED") return null;
  const rateBps = order.restaurant.commissionRateBps ?? settings.defaultCommissionRateBps;
  const commissionCents = calcCommission(order.commissionBaseCents, rateBps);
  const inserted = await tx.$executeRaw`
    INSERT INTO commission_events (id, "orderId", "restaurantId", "orderReference", "billableEvent", "baseCents", "rateBps", "commissionCents", period, status, "createdAt")
    VALUES (${"ce_" + order.id}, ${order.id}, ${order.restaurantId}, ${order.reference}, ${settings.billableEvent}, ${order.commissionBaseCents}, ${rateBps}, ${commissionCents}, ${periodOf(at)}, 'ACCRUED', NOW())
    ON CONFLICT ("orderId") DO NOTHING`;
  if (inserted === 0) return null;
  await tx.orderEvent.create({
    data: { orderId: order.id, type: "COMMISSION_CREATED", actorType: "SYSTEM", data: { baseCents: order.commissionBaseCents, rateBps, commissionCents, billableEvent: settings.billableEvent } },
  });
  await tx.analyticsEvent.create({ data: { type: "commission_created", restaurantId: order.restaurantId, orderId: order.id } });
  return tx.commissionEvent.findUnique({ where: { orderId: order.id } });
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
