import "server-only";
import { z } from "zod";
import type { Fulfillment, OrderStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";
import { getSettings, type Settings } from "./settings";
import { nextCounter } from "./counters";
import { ensureCommission, isUniqueViolation } from "./commission";
import { notifyRestaurant, notifyUser, render, type Text } from "./notifications";
import { sendEmail } from "./email";
import { tFor } from "@/i18n/server";
import { randomToken } from "./crypto";
import { validateSelections, unitPrice, type CustomizationGroupDef } from "@/lib/customization";
import { formatPhone, normalizeMobile } from "@/lib/phone";
import { formatMoney, parseAmount, toUsdCents } from "@/lib/money";
import { isOpenAt, type OpeningHours } from "@/lib/hours";
import { STATUS_META, type OrderStatusKey } from "@/lib/order-status";
import { formatKm, isValidLatLng, quoteDelivery } from "@/lib/geo";
import { pushToRestaurantStaff, pushToUsers } from "./push";

export class OrderError extends Error {
  status = 400;
  /** `texts`: translatable versions (key + values) of the message ("_") or of field errors, shown in the customer's language. */
  constructor(message: string, public fieldErrors?: Record<string, string>, public texts?: Record<string, { k: string; v?: Record<string, string | number> }>) {
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
  changeFor: z.string().trim().max(20).optional().nullable(),
  customer: z.object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    phone: z.string().trim().min(6, "Enter your mobile number").max(30),
    addressId: z.string().optional().nullable(),
    address: z.string().trim().max(300).optional().nullable(),
    building: z.string().trim().max(120).optional().nullable(),
    area: z.string().trim().max(80).optional().nullable(),
    notes: z.string().trim().max(400).optional().nullable(),
    mapsUrl: z.string().trim().max(500).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    saveAddress: z.boolean().optional(),
    addressLabel: z.string().trim().max(40).optional().nullable(),
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

type PricedLine = {
  menuItemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitBaseCents: number;
  unitOptionsCents: number;
  unitTotalCents: number;
  lineTotalCents: number;
  specialInstructions: string | null;
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
    lines.push({
      menuItemId: m.id,
      sku: m.sku,
      name: m.name,
      quantity: it.quantity,
      unitBaseCents: m.priceCents,
      unitOptionsCents: v.unitOptionsCents,
      unitTotalCents: unitTotal,
      lineTotalCents: unitTotal * it.quantity,
      chosen: v.chosen,
      specialInstructions: it.note?.trim() || null,
    });
  });
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  return { lines, subtotalCents, fieldErrors, currency: menuItems[0]?.currency ?? "USD" };
}

export type CreatedOrder = { reference: string; trackingToken: string; totalCents: number; currency: string; duplicate: boolean };

export async function createOrder(raw: unknown, meta: { deviceKey: string | null; ipHash: string | null; userId: string | null }): Promise<CreatedOrder> {
  if (!meta.userId) {
    const e = new OrderError("Please log in to place your order");
    e.status = 401;
    throw e;
  }
  const parsed = orderInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    throw new OrderError("Please check your order details", fieldErrors);
  }
  const input = parsed.data;

  // Idempotency: the same submission (double tap / refresh / retry) returns the same order.
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.restaurantId !== input.restaurantId) throw new OrderError("Invalid order submission");
    return { reference: existing.reference, trackingToken: existing.trackingToken, totalCents: existing.totalCents, currency: existing.currency, duplicate: true };
  }

  const settings = await getSettings();
  const restaurant = await prisma.restaurant.findUnique({ where: { id: input.restaurantId } });
  if (!restaurant || restaurant.status !== "ACTIVE") throw new OrderError("This restaurant is not accepting orders right now");
  if (!restaurant.orderingEnabled || !restaurant.agreementAcceptedAt) throw new OrderError("This restaurant isn't taking online orders right now");
  if (isOpenAt(restaurant.openingHours as OpeningHours) === false) throw new OrderError(`${restaurant.displayName} is closed right now`);
  if (input.fulfillment === "DELIVERY" && !restaurant.deliveryEnabled) throw new OrderError("Delivery is not available from this restaurant", { fulfillment: "Delivery not available" });
  if (input.fulfillment === "PICKUP" && !restaurant.pickupEnabled) throw new OrderError("Pickup is not available from this restaurant", { fulfillment: "Pickup not available" });

  // A logged-in customer may use one of their saved addresses.
  const c = { ...input.customer };
  if (c.addressId) {
    if (!meta.userId) throw new OrderError("Please log in to use a saved address");
    const saved = await prisma.customerAddress.findFirst({ where: { id: c.addressId, userId: meta.userId } });
    if (!saved) throw new OrderError("Saved address not found", { "customer.addressId": "Choose another address" });
    Object.assign(c, { address: saved.address, building: saved.building, area: saved.area, mapsUrl: saved.mapsUrl, latitude: saved.latitude, longitude: saved.longitude, notes: c.notes || saved.notes });
  }

  const fieldErrors: Record<string, string> = {};
  const texts: NonNullable<OrderError["texts"]> = {};
  const phone = normalizeMobile(c.phone);
  if (!phone.ok) fieldErrors["customer.phone"] = phone.error;
  const mapsUrl = normalizeMapsUrl(c.mapsUrl, c.latitude, c.longitude);
  if (c.mapsUrl && !mapsUrl && c.latitude == null) fieldErrors["customer.mapsUrl"] = "Enter a valid Google Maps link";
  let deliveryFeeCents = 0;
  let distance: number | null = null;
  if (input.fulfillment === "DELIVERY") {
    if (!c.address || c.address.length < 4) fieldErrors["customer.address"] = "Enter your delivery address";
    // Delivery needs an exact pin: the fee and the delivery range are based on distance.
    if (!isValidLatLng(c.latitude, c.longitude)) fieldErrors["customer.location"] = "Pin your delivery location on the map";
    else {
      const q = quoteDelivery(restaurant, { lat: c.latitude!, lng: c.longitude! });
      if (q.deliverable) {
        deliveryFeeCents = q.feeCents;
        distance = Math.round(q.km * 100) / 100;
      } else if (q.reason === "out_of_range") {
        fieldErrors["customer.location"] = `This address is ${formatKm(q.km!)} away — ${restaurant.displayName} delivers up to ${formatKm(q.maxKm)}. Choose pickup or another restaurant.`;
        texts["customer.location"] = { k: "This address is {km} away — {name} delivers up to {max}. Choose pickup or another restaurant.", v: { km: q.km!, name: restaurant.displayName, max: q.maxKm } };
      } else {
        fieldErrors["customer.location"] = `${restaurant.displayName} hasn't set up delivery yet — choose pickup`;
        texts["customer.location"] = { k: "{name} hasn't set up delivery yet — choose pickup", v: { name: restaurant.displayName } };
      }
    }
  }

  const priced = await priceCart(restaurant.id, input.items);
  Object.assign(fieldErrors, priced.fieldErrors);
  if (Object.keys(fieldErrors).length) throw new OrderError("Please check your order details", fieldErrors, texts);
  if (restaurant.minOrderCents && priced.subtotalCents < restaurant.minOrderCents) {
    const amount = formatMoney(restaurant.minOrderCents, restaurant.currency);
    throw new OrderError(`Minimum order is ${amount}`, undefined, { _: { k: "Minimum order is {amount}.", v: { amount } } });
  }

  const currency = restaurant.currency;
  const totalCents = priced.subtotalCents + deliveryFeeCents;
  let changeForCents: number | null = null;
  if (input.changeFor) {
    changeForCents = parseAmount(input.changeFor, currency);
    if (changeForCents === null || changeForCents < totalCents) throw new OrderError("Please check your order details", { changeFor: `Enter a bill amount of at least ${formatMoney(totalCents, currency)}` }, { changeFor: { k: "Enter a bill amount of at least {amount}", v: { amount: formatMoney(totalCents, currency) } } });
  }
  const exchangeRate = currency === "USD" ? null : settings.lbpPerUsd;
  const commissionBaseCents = toUsdCents(priced.subtotalCents, currency, exchangeRate);
  const e164 = (phone as { e164: string }).e164;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const seq = await nextCounter(tx, `order:${year}`);
      const reference = `NN-${year}-${String(seq).padStart(6, "0")}`;

      // Duplicate heuristic: same device/phone, same restaurant & subtotal within 3 minutes → flag for review (not blocked).
      let suspicious = false;
      let suspiciousReason: string | null = null;
      const dup = await tx.order.findFirst({
        where: { restaurantId: restaurant.id, subtotalCents: priced.subtotalCents, createdAt: { gte: new Date(Date.now() - 3 * 60_000) }, OR: [{ customerPhone: e164 }, ...(meta.deviceKey ? [{ deviceKey: meta.deviceKey }] : [])] },
        select: { reference: true },
      });
      if (dup) {
        suspicious = true;
        suspiciousReason = `Possible duplicate of ${dup.reference}`;
      }

      const created = await tx.order.create({
        data: {
          reference,
          idempotencyKey: input.idempotencyKey,
          trackingToken: randomToken(18),
          restaurantId: restaurant.id,
          userId: meta.userId,
          status: "PLACED",
          fulfillment: input.fulfillment as Fulfillment,
          changeForCents,
          customerName: c.name,
          customerPhone: e164,
          address: input.fulfillment === "DELIVERY" ? c.address : null,
          building: input.fulfillment === "DELIVERY" ? c.building || null : null,
          deliveryArea: input.fulfillment === "DELIVERY" ? c.area || null : null,
          notes: c.notes || null,
          mapsUrl: input.fulfillment === "DELIVERY" ? mapsUrl : null,
          latitude: input.fulfillment === "DELIVERY" ? c.latitude ?? null : null,
          longitude: input.fulfillment === "DELIVERY" ? c.longitude ?? null : null,
          currency,
          subtotalCents: priced.subtotalCents,
          deliveryFeeCents,
          totalCents,
          commissionBaseCents,
          exchangeRate,
          restaurantName: restaurant.displayName,
          restaurantPhone: restaurant.phone,
          distanceKm: distance,
          deviceKey: meta.deviceKey,
          ipHash: meta.ipHash,
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
          events: { create: [{ type: "PLACED", actorType: "CUSTOMER", actorId: meta.userId }] },
        },
      });

      if (meta.userId) {
        // Remember the delivery address and phone for next time.
        if (input.fulfillment === "DELIVERY" && c.saveAddress && !c.addressId && c.address) {
          const count = await tx.customerAddress.count({ where: { userId: meta.userId } });
          if (count < 20) {
            await tx.customerAddress.create({ data: { userId: meta.userId, label: c.addressLabel?.trim() || (count === 0 ? "Home" : `Address ${count + 1}`), area: c.area || null, address: c.address, building: c.building || null, notes: c.notes || null, latitude: c.latitude ?? null, longitude: c.longitude ?? null, mapsUrl, isDefault: count === 0 } });
          }
        }
        await tx.user.updateMany({ where: { id: meta.userId, phone: null }, data: { phone: e164 } });
      }

      const reelIds = Array.from(new Set(input.items.map((i) => i.reelId).filter(Boolean))) as string[];
      await tx.analyticsEvent.create({ data: { type: "order_placed", restaurantId: restaurant.id, orderId: created.id, deviceKey: meta.deviceKey, data: { reelIds } } });
      if (reelIds.length) await tx.reel.updateMany({ where: { id: { in: reelIds }, restaurantId: restaurant.id }, data: { orderInits: { increment: 1 } } });
      await notifyRestaurant(
        restaurant.id,
        { type: "NEW_ORDER", title: { k: "New order {ref} · {total}", v: { ref: reference, total: formatMoney(totalCents, currency) } }, body: { k: input.fulfillment === "DELIVERY" ? "{name} · Delivery · cash on delivery" : "{name} · Pickup · cash on delivery", v: { name: c.name } }, link: `/dashboard/orders?ref=${reference}` },
        tx,
      );
      return created;
    });
    // Phone notification to every staff device (never blocks the order).
    void pushToRestaurantStaff(restaurant.id, (t) => ({
      title: `🔔 ${t("New order · {total}", { total: formatMoney(totalCents, currency) })}`,
      body: `${c.name} · ${input.fulfillment === "DELIVERY" ? `${t("Delivery")}${distance != null ? ` (${formatKm(distance)})` : ""}` : t("Pickup")} · ${t("{n} items", { n: priced.lines.reduce((n, l) => n + l.quantity, 0) })}`,
      url: `/dashboard/orders?ref=${order.reference}`,
      tag: `order-${order.reference}`,
    }));
    void emailNewOrder(restaurant.id, order.reference, {
      customer: `${c.name} · ${formatPhone(e164)}`,
      delivery: input.fulfillment === "DELIVERY" ? { km: distance != null ? formatKm(distance) : null, address: [c.area, c.address, c.building].filter(Boolean).join(", ") } : null,
      lines: priced.lines.map((l) => `${l.quantity}× ${l.name}${l.chosen.length ? ` (${l.chosen.map((x) => x.optionName).join(", ")})` : ""}${l.specialInstructions ? ` — ${l.specialInstructions}` : ""}  ${formatMoney(l.lineTotalCents, currency)}`),
      total: formatMoney(totalCents, currency),
      notes: c.notes || null,
    });
    return { reference: order.reference, trackingToken: order.trackingToken, totalCents: order.totalCents, currency: order.currency, duplicate: false };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (again) return { reference: again.reference, trackingToken: again.trackingToken, totalCents: again.totalCents, currency: again.currency, duplicate: true };
    }
    throw e;
  }
}

/** Email the restaurant (its contact email + owners/managers) about a new order. Never throws. */
async function emailNewOrder(restaurantId: string, reference: string, o: { customer: string; delivery: { km: string | null; address: string } | null; lines: string[]; total: string; notes: string | null }) {
  try {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { displayName: true, email: true, staff: { where: { role: { in: ["OWNER", "MANAGER"] } }, orderBy: { role: "asc" }, select: { user: { select: { email: true, locale: true } } } } } });
    if (!r) return;
    // Each person gets the email in their language; the restaurant's contact address in the owner's.
    const recipients = new Map<string, string | null>();
    for (const s of r.staff) if (!recipients.has(s.user.email)) recipients.set(s.user.email, s.user.locale);
    if (r.email && !recipients.has(r.email)) recipients.set(r.email, r.staff[0]?.user.locale ?? null);
    const link = `${process.env.APP_URL ?? ""}/dashboard/orders?ref=${reference}`;
    await Promise.all(
      [...recipients].map(([addr, locale]) => {
        const t = tFor(locale);
        const how = o.delivery ? `${t("Delivery")}${o.delivery.km ? ` (${o.delivery.km})` : ""}: ${o.delivery.address}` : t("Pickup");
        const text = [t("New order {ref} for {name}", { ref: reference, name: r.displayName }), "", `${t("Customer")}: ${o.customer}`, how, "", ...o.lines, "", `${t("Total (cash on delivery)")}: ${o.total}`, ...(o.notes ? ["", `${t("Note")}: ${o.notes}`] : []), "", `${t("Accept it in your dashboard")}: ${link}`].join("\n");
        return sendEmail(addr, `🔔 ${t("New order {ref} · {total}", { ref: reference, total: o.total })}`, text);
      }),
    );
  } catch (e) {
    console.error("[email] new order", e);
  }
}

// ───── lifecycle ─────

export type RestaurantOrderAction = "ACCEPT" | "REJECT" | "PREPARING" | "DISPATCH" | "COMPLETE" | "FAIL";

const ALLOWED_FROM: Record<RestaurantOrderAction, OrderStatus[]> = {
  ACCEPT: ["PLACED"],
  REJECT: ["PLACED"],
  PREPARING: ["ACCEPTED"],
  DISPATCH: ["ACCEPTED", "PREPARING"],
  COMPLETE: ["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"],
  FAIL: ["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"],
};

async function notifyCustomer(tx: Tx, order: { id: string; userId: string | null; reference: string; restaurantName: string; trackingToken: string }, status: OrderStatusKey, extra?: Text) {
  if (!order.userId) return;
  // Everything goes out in the customer's language (their account setting).
  const u = await tx.user.findUnique({ where: { id: order.userId }, select: { email: true, locale: true } });
  const t = tFor(u?.locale);
  const title = `${order.restaurantName}: ${t(STATUS_META[status].customer)}`;
  const note = render(t, extra);
  await notifyUser(order.userId, { type: "ORDER_STATUS", title, body: note, link: `/order/${order.reference}` }, tx);
  if (u?.email) void sendEmail(u.email, t("Order {ref} — {status}", { ref: order.reference, status: t(STATUS_META[status].label) }), `${title}${note ? `\n${note}` : ""}\n\n${process.env.APP_URL ?? ""}/order/${order.reference}?t=${order.trackingToken}`);
  // Phone notification (if they turned notifications on); tapping opens the order.
  void pushToUsers([order.userId], { title, body: note || t("Tap to see your order"), url: `/order/${order.reference}`, tag: `status-${order.reference}` });
}

/**
 * Restaurant lifecycle transitions, scoped by restaurantId for tenant isolation.
 * Commission is created exactly once when the configured billable milestone is reached.
 */
export async function restaurantOrderAction(restaurantId: string, userId: string, orderId: string, action: RestaurantOrderAction, opts: { reason?: string; etaMinutes?: number } = {}) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId} AND "restaurantId" = ${restaurantId} FOR UPDATE`;
    if (!rows.length) throw new OrderError("Order not found");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { restaurant: { select: { avgPrepMinutes: true } } } });
    const target: Record<RestaurantOrderAction, OrderStatus> = { ACCEPT: "ACCEPTED", REJECT: "REJECTED", PREPARING: "PREPARING", DISPATCH: order.fulfillment === "DELIVERY" ? "OUT_FOR_DELIVERY" : "READY_FOR_PICKUP", COMPLETE: "COMPLETED", FAIL: "FAILED" };
    if (order.status === target[action]) return order; // idempotent
    if (!ALLOWED_FROM[action].includes(order.status)) throw new OrderError(`This order is already ${STATUS_META[order.status].label.toLowerCase()}`);
    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: target[action] };
    let extra: Text | undefined;
    switch (action) {
      case "ACCEPT": {
        const eta = Math.round(opts.etaMinutes ?? order.restaurant.avgPrepMinutes);
        if (!Number.isFinite(eta) || eta < 5 || eta > 240) throw new OrderError("Choose a time between 5 and 240 minutes");
        data.acceptedAt = now;
        data.estimatedMinutes = eta;
        extra = { k: order.fulfillment === "DELIVERY" ? "Estimated delivery time: about {n} minutes." : "Estimated ready time: about {n} minutes.", v: { n: eta } };
        break;
      }
      case "REJECT":
        if (!opts.reason?.trim()) throw new OrderError("Tell the customer why");
        data.rejectedAt = now;
        data.rejectionReason = opts.reason.trim().slice(0, 300);
        extra = data.rejectionReason as string;
        break;
      case "PREPARING":
        data.preparingAt = now;
        break;
      case "DISPATCH":
        data.preparingAt = order.preparingAt ?? now;
        data.dispatchedAt = now;
        break;
      case "COMPLETE":
        data.completedAt = now;
        break;
      case "FAIL":
        if (!opts.reason?.trim()) throw new OrderError("Explain what happened");
        data.failedAt = now;
        data.failureReason = opts.reason.trim().slice(0, 300);
        break;
    }
    const updated = await tx.order.update({ where: { id: orderId }, data });
    await tx.orderEvent.create({ data: { orderId, type: target[action], actorType: "RESTAURANT", actorId: userId, data: opts.reason || opts.etaMinutes ? { reason: opts.reason ?? null, etaMinutes: opts.etaMinutes ?? null } : undefined } });
    await tx.analyticsEvent.create({ data: { type: `order_${target[action].toLowerCase()}`, restaurantId, orderId } });
    await notifyCustomer(tx, updated, target[action], extra);
    await ensureCommission(tx, orderId, settings);
    return updated;
  });
}

export type OrderViewer = { userId: string | null; deviceKey: string | null; token?: string | null };

/** Customers can see an order they placed: same account, same device, or the private tracking link. */
export function canViewOrder(order: { userId: string | null; deviceKey: string | null; trackingToken: string }, v: OrderViewer) {
  return (!!order.userId && order.userId === v.userId) || (!!order.deviceKey && order.deviceKey === v.deviceKey) || (!!v.token && v.token === order.trackingToken);
}

/** Customers may cancel only while the restaurant hasn't accepted yet. */
export async function customerCancelOrder(reference: string, viewer: OrderViewer, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { reference } });
    if (!order || !canViewOrder(order, viewer)) throw new OrderError("Order not found");
    if (order.status === "CANCELED") return order;
    if (order.status !== "PLACED") throw new OrderError("The restaurant already accepted this order. Please call them to change it.");
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: "CANCELED", canceledAt: new Date(), canceledBy: "CUSTOMER", cancelReason: reason?.slice(0, 300) || null } });
    await tx.orderEvent.create({ data: { orderId: order.id, type: "CANCELED", actorType: "CUSTOMER", actorId: viewer.userId, data: { reason: reason ?? null } } });
    await notifyRestaurant(order.restaurantId, { type: "ORDER_CANCELED", title: { k: "Order {ref} was canceled by the customer", v: { ref: order.reference } }, link: `/dashboard/orders?ref=${order.reference}` }, tx);
    return updated;
  });
}

/**
 * Accepted orders that the restaurant never closed are completed automatically
 * after the configured number of hours, so commission can't be avoided by
 * leaving orders open. Restaurants can still report a failed delivery earlier.
 */
export async function autoCompleteStaleOrders(settingsIn?: Settings, now = new Date()) {
  const settings = settingsIn ?? (await getSettings());
  const cutoff = new Date(now.getTime() - settings.autoCompleteHours * 3600_000);
  const stale = await prisma.order.findMany({ where: { status: { in: ["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] }, acceptedAt: { lt: cutoff } }, select: { id: true } });
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({ where: { id }, data: { status: "COMPLETED", completedAt: now, autoCompleted: true } });
      await tx.orderEvent.create({ data: { orderId: id, type: "AUTO_COMPLETED", actorType: "SYSTEM", data: { afterHours: settings.autoCompleteHours } } });
      await notifyRestaurant(o.restaurantId, { type: "ORDER_AUTO_COMPLETED", title: { k: "Order {ref} was marked completed automatically", v: { ref: o.reference } }, body: { k: "It stayed open for more than {n} hours. If it wasn't delivered, open a dispute from Billing.", v: { n: settings.autoCompleteHours } }, link: `/dashboard/orders?ref=${o.reference}` }, tx);
      await ensureCommission(tx, id, settings);
    });
  }
  return stale.length;
}

/** Admin override: cancel an order record (un-invoiced commission is voided; invoiced needs a credit). */
export async function adminCancelOrder(adminId: string, orderId: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.update({ where: { id: orderId }, data: { status: "CANCELED", canceledAt: new Date(), canceledBy: "ADMIN", cancelReason: note } });
    await tx.orderEvent.create({ data: { orderId, type: "ADMIN_CANCELED", actorType: "ADMIN", actorId: adminId, data: { note } } });
    await tx.commissionEvent.updateMany({ where: { orderId, status: "ACCRUED" }, data: { status: "VOIDED" } });
    await notifyCustomer(tx, order, "CANCELED", note || undefined);
    return order;
  });
}

/** After sign-in, guest orders placed from this device join the account's order history. */
export async function claimDeviceOrders(userId: string, deviceKey: string | null) {
  if (!deviceKey) return 0;
  const r = await prisma.order.updateMany({ where: { deviceKey, userId: null }, data: { userId } });
  return r.count;
}
