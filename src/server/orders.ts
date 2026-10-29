import "server-only";
import { z } from "zod";
import type { Fulfillment, OrderStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";
import { getSettings } from "./settings";
import { nextCounter } from "./counters";
import { ensureCommission, isUniqueViolation } from "./commission";
import { notifyRestaurant } from "./notifications";
import { validateSelections, unitPrice, type CustomizationGroupDef } from "@/lib/customization";
import { normalizePhone } from "@/lib/phone";
import { toUsdCents } from "@/lib/money";
import { buildOrderMessage, buildWhatsAppLink, type MessageLine } from "@/lib/whatsapp";

export class OrderError extends Error {
  status = 400;
  constructor(message: string, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export const MAX_QTY = 50;
export const MAX_LINES = 40;

export const orderInputSchema = z.object({
  idempotencyKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
  restaurantId: z.string().min(1),
  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(MAX_QTY),
        selections: z.record(z.union([z.array(z.string()), z.string()])).default({}),
        note: z.string().max(300).optional().nullable(),
        reelId: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(MAX_LINES),
  customer: z.object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    phone: z.string().trim().min(6, "Enter your phone number").max(30),
    address: z.string().trim().max(300).optional().nullable(),
    building: z.string().trim().max(120).optional().nullable(),
    area: z.string().trim().max(80).optional().nullable(),
    notes: z.string().trim().max(400).optional().nullable(),
    mapsUrl: z.string().trim().max(500).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
  }),
});

export type OrderInput = z.infer<typeof orderInputSchema>;

const MAPS_HOSTS = /^(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl)$/i;

export function normalizeMapsUrl(url: string | null | undefined, lat?: number | null, lng?: number | null): string | null {
  if (lat != null && lng != null) return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!MAPS_HOSTS.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

type PricedLine = MessageLine & {
  menuItemId: string;
  sku: string;
  unitOptionsCents: number;
  unitTotalCents: number;
  chosen: { groupName: string; optionName: string; optionId: string | null; priceDeltaCents: number }[];
};

/** Server-side authoritative pricing. Never trusts client prices. */
export async function priceCart(restaurantId: string, items: OrderInput["items"], client: Tx | typeof prisma = prisma) {
  const ids = Array.from(new Set(items.map((i) => i.menuItemId)));
  const menuItems = await client.menuItem.findMany({
    where: { id: { in: ids }, restaurantId },
    include: { customizations: { orderBy: { sortOrder: "asc" }, include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } } } },
  });
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  const fieldErrors: Record<string, string> = {};
  const lines: PricedLine[] = [];
  items.forEach((it, idx) => {
    const m = byId.get(it.menuItemId);
    if (!m || m.archived) {
      fieldErrors[`items.${idx}`] = "This item is no longer on the menu";
      return;
    }
    if (!m.available) {
      fieldErrors[`items.${idx}`] = `${m.name} is currently unavailable`;
      return;
    }
    const groups: CustomizationGroupDef[] = m.customizations.map((c) => ({
      id: c.group.id,
      name: c.group.name,
      type: c.group.type,
      required: c.group.required,
      minSelect: c.group.minSelect,
      maxSelect: c.group.maxSelect,
      options: c.group.options.map((o) => ({ id: o.id, name: o.name, priceDeltaCents: o.priceDeltaCents, available: o.available })),
    }));
    const v = validateSelections(groups, it.selections);
    if (!v.ok) {
      fieldErrors[`items.${idx}`] = `${m.name}: ${Object.values(v.errors)[0]}`;
      return;
    }
    const unitTotal = unitPrice(m.priceCents, v.unitOptionsCents);
    const textGroups = new Set(groups.filter((g) => g.type === "TEXT").map((g) => g.id));
    lines.push({
      menuItemId: m.id,
      sku: m.sku,
      name: m.name,
      quantity: it.quantity,
      unitBaseCents: m.priceCents,
      unitOptionsCents: v.unitOptionsCents,
      unitTotalCents: unitTotal,
      lineTotalCents: unitTotal * it.quantity,
      customizations: v.chosen.map((c) => ({ groupName: c.groupName, optionName: c.optionName, priceDeltaCents: c.priceDeltaCents, isText: textGroups.has(c.groupId) })),
      chosen: v.chosen,
      specialInstructions: it.note?.trim() || null,
    });
  });
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  return { lines, subtotalCents, fieldErrors, currency: menuItems[0]?.currency ?? "USD" };
}

export type CreatedOrder = { reference: string; whatsappUrl: string; message: string; subtotalCents: number; currency: string; deliveryFeeCents: number | null; restaurantSlug: string; duplicateOf?: boolean };

export async function createOrder(raw: unknown, meta: { deviceKey: string | null; ipHash: string | null }): Promise<CreatedOrder> {
  const parsed = orderInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    throw new OrderError("Please check your order details", fieldErrors);
  }
  const input = parsed.data;

  // Idempotency: the same submission (double tap / refresh / retry) returns the same order.
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { restaurant: { select: { slug: true } } } });
  if (existing) {
    if (existing.restaurantId !== input.restaurantId) throw new OrderError("Invalid order submission");
    return toCreated(existing, existing.restaurant.slug, true);
  }

  const settings = await getSettings();
  const restaurant = await prisma.restaurant.findUnique({ where: { id: input.restaurantId }, include: { deliveryAreas: true } });
  if (!restaurant || restaurant.status !== "ACTIVE") throw new OrderError("This restaurant is not accepting orders right now");
  if (!restaurant.orderingEnabled || !restaurant.agreementAcceptedAt || !restaurant.whatsappNumber) throw new OrderError("This restaurant has not enabled WhatsApp ordering yet");
  if (input.fulfillment === "DELIVERY" && !restaurant.deliveryEnabled) throw new OrderError("Delivery is not available from this restaurant", { fulfillment: "Delivery not available" });
  if (input.fulfillment === "PICKUP" && !restaurant.pickupEnabled) throw new OrderError("Pickup is not available from this restaurant", { fulfillment: "Pickup not available" });

  const c = input.customer;
  const fieldErrors: Record<string, string> = {};
  const phone = normalizePhone(c.phone);
  if (!phone.ok) fieldErrors["customer.phone"] = phone.error;
  const mapsUrl = normalizeMapsUrl(c.mapsUrl, c.latitude, c.longitude);
  if (c.mapsUrl && !mapsUrl) fieldErrors["customer.mapsUrl"] = "Enter a valid Google Maps link";
  if (input.fulfillment === "DELIVERY") {
    if (!c.address || c.address.length < 4) fieldErrors["customer.address"] = "Enter your delivery address";
    if (restaurant.requireMapsLocation && !mapsUrl) fieldErrors["customer.mapsUrl"] = "This restaurant requires your Google Maps location";
  }

  const priced = await priceCart(restaurant.id, input.items);
  Object.assign(fieldErrors, priced.fieldErrors);
  if (Object.keys(fieldErrors).length) throw new OrderError("Please check your order details", fieldErrors);
  if (restaurant.minOrderCents && priced.subtotalCents < restaurant.minOrderCents) throw new OrderError("Your order is below the restaurant's minimum order");

  let deliveryFeeCents: number | null = null;
  if (input.fulfillment === "DELIVERY") {
    const area = c.area ? restaurant.deliveryAreas.find((a) => a.name.toLowerCase() === c.area!.toLowerCase()) : null;
    deliveryFeeCents = area?.feeCents ?? (restaurant.deliveryAreas.length && !area ? null : restaurant.deliveryFeeCents);
  }

  const currency = restaurant.currency;
  const exchangeRate = currency === "USD" ? null : settings.lbpPerUsd;
  const commissionBaseCents = toUsdCents(priced.subtotalCents, currency, exchangeRate);

  try {
    const order = await prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const seq = await nextCounter(tx, `order:${year}`);
      const reference = `NN-${year}-${String(seq).padStart(6, "0")}`;
      const message = buildOrderMessage({
        platformName: settings.platformName,
        reference,
        restaurantName: restaurant.displayName,
        currency,
        customer: {
          name: c.name,
          phone: (phone as { e164: string }).e164,
          fulfillment: input.fulfillment,
          address: c.address,
          building: c.building,
          area: c.area,
          notes: c.notes,
          mapsUrl,
        },
        lines: priced.lines,
        subtotalCents: priced.subtotalCents,
        deliveryFeeCents,
      });

      // Duplicate heuristic: same device, same restaurant & subtotal within 3 minutes.
      let suspicious = false;
      let suspiciousReason: string | null = null;
      if (meta.deviceKey) {
        const dup = await tx.order.findFirst({
          where: { restaurantId: restaurant.id, deviceKey: meta.deviceKey, subtotalCents: priced.subtotalCents, createdAt: { gte: new Date(Date.now() - 3 * 60_000) } },
          select: { reference: true },
        });
        if (dup) {
          suspicious = true;
          suspiciousReason = `Possible duplicate of ${dup.reference}`;
        }
      }

      const now = new Date();
      const created = await tx.order.create({
        data: {
          reference,
          idempotencyKey: input.idempotencyKey,
          restaurantId: restaurant.id,
          status: "LINK_GENERATED",
          fulfillment: input.fulfillment as Fulfillment,
          customerName: c.name,
          customerPhone: (phone as { e164: string }).e164,
          address: input.fulfillment === "DELIVERY" ? c.address : null,
          building: input.fulfillment === "DELIVERY" ? c.building || null : null,
          deliveryArea: input.fulfillment === "DELIVERY" ? c.area || null : null,
          notes: c.notes || null,
          mapsUrl,
          latitude: c.latitude ?? null,
          longitude: c.longitude ?? null,
          currency,
          subtotalCents: priced.subtotalCents,
          deliveryFeeCents,
          totalCents: input.fulfillment === "PICKUP" ? priced.subtotalCents : deliveryFeeCents != null ? priced.subtotalCents + deliveryFeeCents : null,
          commissionBaseCents,
          exchangeRate,
          whatsappNumber: restaurant.whatsappNumber!,
          restaurantName: restaurant.displayName,
          message,
          deviceKey: meta.deviceKey,
          ipHash: meta.ipHash,
          linkGeneratedAt: now,
          suspicious,
          suspiciousReason,
          items: {
            create: priced.lines.map((l) => ({
              menuItemId: l.menuItemId,
              sku: l.sku,
              name: l.name,
              quantity: l.quantity,
              unitBaseCents: l.unitBaseCents,
              unitOptionsCents: l.unitOptionsCents,
              unitTotalCents: l.unitTotalCents,
              lineTotalCents: l.lineTotalCents,
              specialInstructions: l.specialInstructions,
              customizations: { create: l.chosen.map((ch) => ({ groupName: ch.groupName, optionName: ch.optionName, optionId: ch.optionId, priceDeltaCents: ch.priceDeltaCents })) },
            })),
          },
          events: {
            create: [
              { type: "VALIDATED", actorType: "CUSTOMER", createdAt: now },
              { type: "LINK_GENERATED", actorType: "CUSTOMER", createdAt: now },
            ],
          },
        },
      });

      const reelIds = Array.from(new Set(input.items.map((i) => i.reelId).filter(Boolean))) as string[];
      await tx.analyticsEvent.create({ data: { type: "whatsapp_link_generated", restaurantId: restaurant.id, orderId: created.id, deviceKey: meta.deviceKey, data: { reelIds } } });
      if (reelIds.length) await tx.reel.updateMany({ where: { id: { in: reelIds }, restaurantId: restaurant.id }, data: { orderInits: { increment: 1 } } });
      await notifyRestaurant(restaurant.id, { type: "ORDER_REQUEST", title: `New order request ${reference}`, body: `${c.name} · ${priced.lines.length} item(s). Acknowledge it once you receive the WhatsApp message.`, link: `/dashboard/orders?ref=${reference}` }, tx);
      return created;
    });
    return toCreated(order, restaurant.slug, false);
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { restaurant: { select: { slug: true } } } });
      if (again) return toCreated(again, again.restaurant.slug, true);
    }
    throw e;
  }
}

function toCreated(o: { reference: string; whatsappNumber: string; message: string; subtotalCents: number; currency: string; deliveryFeeCents: number | null }, slug: string, duplicateOf: boolean): CreatedOrder {
  return {
    reference: o.reference,
    whatsappUrl: buildWhatsAppLink(o.whatsappNumber, o.message),
    message: o.message,
    subtotalCents: o.subtotalCents,
    currency: o.currency,
    deliveryFeeCents: o.deliveryFeeCents,
    restaurantSlug: slug,
    duplicateOf,
  };
}

/** Customer opened WhatsApp. This is a handoff attempt — NOT proof the message was sent. Never billable. */
export async function recordHandoff(reference: string, deviceKey: string | null) {
  const order = await prisma.order.findUnique({ where: { reference } });
  if (!order) throw new OrderError("Order not found");
  if (order.deviceKey && deviceKey && order.deviceKey !== deviceKey) throw new OrderError("Order not found");
  const first = !order.handoffAt;
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        handoffCount: { increment: 1 },
        handoffAt: order.handoffAt ?? new Date(),
        status: order.status === "LINK_GENERATED" ? "HANDOFF_ATTEMPTED" : undefined,
      },
    });
    await tx.orderEvent.create({ data: { orderId: order.id, type: first ? "WHATSAPP_HANDOFF_ATTEMPTED" : "WHATSAPP_HANDOFF_REPEATED", actorType: "CUSTOMER" } });
    if (first) await tx.analyticsEvent.create({ data: { type: "whatsapp_handoff", restaurantId: order.restaurantId, orderId: order.id, deviceKey } });
  });
  return { whatsappUrl: buildWhatsAppLink(order.whatsappNumber, order.message) };
}

const PRE_ACK: OrderStatus[] = ["LINK_GENERATED", "HANDOFF_ATTEMPTED", "MESSAGE_CONFIRMED", "VALIDATED"];

export type RestaurantOrderAction = "ACKNOWLEDGE" | "ACCEPT" | "REJECT" | "FULFILL";

/**
 * Restaurant lifecycle transitions. Scoped by restaurantId for tenant isolation.
 * Acknowledgment is the default billable event; the commission is created exactly once.
 */
export async function restaurantOrderAction(
  restaurantId: string,
  userId: string,
  orderId: string,
  action: RestaurantOrderAction,
  opts: { reason?: string; method?: "LIST" | "REFERENCE_LOOKUP" } = {},
) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId} AND "restaurantId" = ${restaurantId} FOR UPDATE`;
    if (!rows.length) throw new OrderError("Order not found");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const now = new Date();
    const data: Prisma.OrderUpdateInput = {};
    const events: string[] = [];

    const doAck = async () => {
      if (order.acknowledgedAt) return;
      data.acknowledgedAt = now;
      data.status = "ACKNOWLEDGED";
      events.push("RESTAURANT_ACKNOWLEDGED");
      await tx.restaurantOrderAcknowledgment.create({ data: { orderId, userId, method: opts.method ?? "LIST" } });
    };

    switch (action) {
      case "ACKNOWLEDGE":
        if (!PRE_ACK.includes(order.status) && !order.acknowledgedAt) throw new OrderError(`Cannot acknowledge an order that is ${order.status.toLowerCase()}`);
        if (order.acknowledgedAt) return order; // idempotent
        await doAck();
        break;
      case "ACCEPT":
        if (order.acceptedAt) return order;
        if (![...PRE_ACK, "ACKNOWLEDGED"].includes(order.status)) throw new OrderError(`Cannot accept an order that is ${order.status.toLowerCase()}`);
        await doAck();
        data.acceptedAt = now;
        data.status = "ACCEPTED";
        events.push("RESTAURANT_ACCEPTED");
        break;
      case "REJECT":
        if (![...PRE_ACK, "ACKNOWLEDGED"].includes(order.status)) throw new OrderError(`Cannot reject an order that is ${order.status.toLowerCase()}`);
        data.rejectedAt = now;
        data.rejectionReason = opts.reason?.slice(0, 300) || null;
        data.status = "REJECTED";
        events.push("RESTAURANT_REJECTED");
        break;
      case "FULFILL":
        if (order.fulfilledAt) return order;
        if (!["ACKNOWLEDGED", "ACCEPTED"].includes(order.status)) throw new OrderError("Accept the order before marking it fulfilled");
        if (!order.acceptedAt) {
          data.acceptedAt = now;
          events.push("RESTAURANT_ACCEPTED");
        }
        data.fulfilledAt = now;
        data.status = "FULFILLED";
        events.push("RESTAURANT_FULFILLED");
        break;
    }

    const updated = await tx.order.update({ where: { id: orderId }, data });
    for (const type of events) {
      await tx.orderEvent.create({ data: { orderId, type, actorType: "RESTAURANT", actorId: userId, data: type === "RESTAURANT_REJECTED" ? { reason: opts.reason ?? null } : undefined } });
      await tx.analyticsEvent.create({ data: { type: type.toLowerCase(), restaurantId, orderId } });
    }
    await ensureCommission(tx, orderId, settings);
    return updated;
  });
}

/** Admin override: cancel or mark an order disputed (commission handled via disputes/adjustments). */
export async function adminSetOrderStatus(adminId: string, orderId: string, status: "CANCELED" | "DISPUTED", note: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.update({ where: { id: orderId }, data: { status, canceledAt: status === "CANCELED" ? new Date() : undefined } });
    await tx.orderEvent.create({ data: { orderId, type: `ADMIN_${status}`, actorType: "ADMIN", actorId: adminId, data: { note } } });
    // un-invoiced commission on a canceled order is voided; invoiced ones require a credit adjustment
    if (status === "CANCELED") await tx.commissionEvent.updateMany({ where: { orderId, status: "ACCRUED" }, data: { status: "VOIDED" } });
    return order;
  });
}
