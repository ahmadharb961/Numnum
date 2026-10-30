import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { autoCompleteStaleOrders, canViewOrder, claimDeviceOrders, createOrder, customerCancelOrder, OrderError, restaurantOrderAction } from "@/server/orders";
import { generateInvoice, reviewPayment, submitPayment, openDispute, resolveDispute, runMonthlyBilling } from "@/server/billing";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

const meta: { deviceKey: string | null; ipHash: string | null; userId: string | null } = { deviceKey: "device-aaaaaaaaaaaaaaaa", ipHash: null, userId: null };
const key = (s: string) => `test-key-${s}-${"x".repeat(16)}`;

beforeEach(async () => {
  await resetDb();
  meta.userId = (await makeCustomer()).id; // ordering requires an account
});

async function place(f: Awaited<ReturnType<typeof makeRestaurant>>, k: string, m: Partial<typeof meta> = {}, patch: Record<string, unknown> = {}) {
  const o = await createOrder({ ...orderPayload(f, key(k)), ...patch }, { ...meta, ...m });
  return { ...o, order: await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } }) };
}

describe("cash-on-delivery checkout", () => {
  it("prices server-side, adds the delivery fee and stores a PLACED cash order", async () => {
    const f = await makeRestaurant();
    const { order, totalCents } = await place(f, "a", {}, { changeFor: "50" });
    expect(order).toMatchObject({ status: "PLACED", paymentMethod: "CASH_ON_DELIVERY", subtotalCents: 2000, deliveryFeeCents: 200, totalCents: 2200, changeForCents: 5000 });
    expect(totalCents).toBe(2200);
    expect(order.reference).toMatch(/^NN-\d{4}-\d{6}$/);
    expect(order.trackingToken.length).toBeGreaterThan(20);
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id }, include: { customizations: true } });
    expect(items[0].customizations.map((c) => c.optionName).sort()).toEqual(["BBQ sauce", "Extra cheese"]);
    expect(await prisma.notification.count({ where: { restaurantId: f.restaurant.id, type: "NEW_ORDER" } })).toBe(1);
  });

  it("rejects a change amount lower than the total", async () => {
    const f = await makeRestaurant();
    await expect(place(f, "chg", {}, { changeFor: "10" })).rejects.toThrow(/check your order/);
  });

  it("charges by distance zone and refuses addresses outside the delivery radius", async () => {
    const f = await makeRestaurant(); // zones: ≤3 km $2.00, ≤8 km $3.50, pinned in Hamra
    const p = orderPayload(f, key("z1"));
    const near = await createOrder(p, meta); // ~0.4 km away
    expect(near.totalCents).toBe(2200);
    expect((await prisma.order.findUniqueOrThrow({ where: { reference: near.reference } })).distanceKm).toBeCloseTo(0.44, 1);
    const achrafieh = await createOrder({ ...orderPayload(f, key("z2")), customer: { ...p.customer, phone: "71 222 333", latitude: 33.8869, longitude: 35.5197 } }, { ...meta, deviceKey: "dev-z2-aaaaaaaaaaaaaaa" });
    expect(achrafieh.totalCents).toBe(2350); // ~4 km → second zone
    const tripoli = createOrder({ ...orderPayload(f, key("z3")), customer: { ...p.customer, latitude: 34.4367, longitude: 35.8497 } }, meta);
    await expect(tripoli).rejects.toMatchObject({ fieldErrors: { "customer.location": expect.stringMatching(/km away .* delivers up to 8 km/) } });
    const noPin = createOrder({ ...orderPayload(f, key("z4")), customer: { ...p.customer, latitude: null, longitude: null } }, meta);
    await expect(noPin).rejects.toMatchObject({ fieldErrors: { "customer.location": expect.stringMatching(/Pin your delivery location/) } });
    // pickup ignores distance
    const pickup = await createOrder({ ...orderPayload(f, key("z5")), fulfillment: "PICKUP", customer: { name: "Far Away", phone: "76 123 456" } }, { ...meta, deviceKey: "dev-z5-aaaaaaaaaaaaaaa" });
    expect(pickup.totalCents).toBe(2000);
  });

  it("requires an account to order", async () => {
    const f = await makeRestaurant();
    await expect(createOrder(orderPayload(f, key("anon")), { ...meta, userId: null })).rejects.toThrow(/log in/);
  });

  it("refuses orders while the restaurant is closed or paused", async () => {
    const f = await makeRestaurant();
    const closedAllDay = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, []]));
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { openingHours: { ...closedAllDay, mon: [{ open: "03:00", close: "03:01" }] } } });
    await expect(place(f, "closed")).rejects.toThrow(/closed right now/);
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { openingHours: undefined, orderingEnabled: false } });
    await expect(place(f, "paused")).rejects.toThrow(/isn't taking online orders/);
  });

  it("ignores client prices and rejects items from another restaurant", async () => {
    const a = await makeRestaurant();
    const b = await makeRestaurant();
    const p = orderPayload(a, key("x"));
    (p.items[0] as Record<string, unknown>).priceCents = 1;
    p.items[1].menuItemId = b.fries.id;
    await expect(createOrder(p, meta)).rejects.toBeInstanceOf(OrderError);
  });

  it("is idempotent for repeated submissions but allows a new order", async () => {
    const f = await makeRestaurant();
    const first = await place(f, "d");
    const again = await createOrder(orderPayload(f, key("d")), meta);
    expect(again).toMatchObject({ reference: first.reference, duplicate: true });
    const second = await place(f, "e");
    expect(second.reference).not.toBe(first.reference);
    expect(second.order.suspicious).toBe(true); // same phone + subtotal within minutes → flagged, not blocked
  });

  it("saves the address for logged-in customers and reuses it by id", async () => {
    const f = await makeRestaurant();
    const user = await makeCustomer();
    const p = orderPayload(f, key("u1"));
    await createOrder({ ...p, customer: { ...p.customer, saveAddress: true, addressLabel: "Home" } }, { ...meta, userId: user.id });
    const addr = await prisma.customerAddress.findFirstOrThrow({ where: { userId: user.id } });
    expect(addr).toMatchObject({ label: "Home", isDefault: true, address: "Beirut, Hamra, Main street" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe("96170123456");
    const p2 = orderPayload(f, key("u2"));
    const o2 = await createOrder({ ...p2, customer: { name: "Rana", phone: "70123456", addressId: addr.id } }, { ...meta, userId: user.id, deviceKey: "dev2-aaaaaaaaaaaaaaaa" });
    expect((await prisma.order.findUniqueOrThrow({ where: { reference: o2.reference } })).address).toBe("Beirut, Hamra, Main street");
    // someone else's address id is refused
    const other = await makeCustomer();
    await expect(createOrder({ ...orderPayload(f, key("u3")), customer: { name: "X Y", phone: "70123456", addressId: addr.id } }, { ...meta, userId: other.id })).rejects.toThrow(/not found/);
  });

  it("shows an order to its owner, the same device or the tracking link only", async () => {
    const f = await makeRestaurant();
    const { order } = await place(f, "g");
    expect(canViewOrder(order, { userId: meta.userId, deviceKey: null })).toBe(true);
    expect(canViewOrder(order, { userId: null, deviceKey: meta.deviceKey })).toBe(true);
    expect(canViewOrder(order, { userId: "someone-else", deviceKey: "other-device-aaaaaaa" })).toBe(false);
    expect(canViewOrder(order, { userId: null, deviceKey: null, token: order.trackingToken })).toBe(true);
    // legacy guest orders on a device are attached when that person signs in
    await prisma.order.update({ where: { id: order.id }, data: { userId: null } });
    const user = await makeCustomer();
    expect(await claimDeviceOrders(user.id, meta.deviceKey)).toBe(1);
  });
});

describe("order lifecycle", () => {
  it("moves through accepted → preparing → out for delivery → completed with notifications", async () => {
    const f = await makeRestaurant();
    const user = await makeCustomer();
    const { order } = await place(f, "life", { userId: user.id });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT", { etaMinutes: 30 });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "PREPARING");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "DISPATCH");
    let o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o).toMatchObject({ status: "OUT_FOR_DELIVERY", estimatedMinutes: 30 });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "COMPLETE");
    o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("COMPLETED");
    expect(await prisma.notification.count({ where: { userId: user.id, type: "ORDER_STATUS" } })).toBe(4);
    await expect(restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "REJECT", { reason: "x" })).rejects.toThrow(/already/);
  });

  it("customers can cancel only before the restaurant accepts", async () => {
    const f = await makeRestaurant();
    const a = await place(f, "c1");
    await customerCancelOrder(a.reference, { userId: null, deviceKey: meta.deviceKey });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe("CANCELED");
    const b = await place(f, "c2", { deviceKey: "dev-c2-aaaaaaaaaaaaaa" });
    await expect(customerCancelOrder(b.reference, { userId: null, deviceKey: "stranger-aaaaaaaaaaaa" })).rejects.toThrow(/not found/);
    await restaurantOrderAction(f.restaurant.id, f.user.id, b.order.id, "ACCEPT");
    await expect(customerCancelOrder(b.reference, { userId: null, deviceKey: "dev-c2-aaaaaaaaaaaaaa" })).rejects.toThrow(/already accepted/);
  });

  it("restaurant A cannot act on restaurant B's orders", async () => {
    const a = await makeRestaurant();
    const b = await makeRestaurant();
    const { order } = await place(b, "iso");
    await expect(restaurantOrderAction(a.restaurant.id, a.user.id, order.id, "ACCEPT")).rejects.toThrow(/not found/);
  });

  it("rejection and failure need a reason", async () => {
    const f = await makeRestaurant();
    const { order } = await place(f, "r");
    await expect(restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "REJECT")).rejects.toThrow(/why/);
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "REJECT", { reason: "Out of buns" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).rejectionReason).toBe("Out of buns");
  });
});

describe("commission integrity", () => {
  it("a $20 completed order generates exactly one $2.80 commission; rejected/canceled never do", async () => {
    const f = await makeRestaurant();
    const { order } = await place(f, "f");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
    expect(await prisma.commissionEvent.count()).toBe(0); // default: charged on completion
    await Promise.all([1, 2, 3].map(() => restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "COMPLETE").catch(() => null)));
    const events = await prisma.commissionEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ baseCents: 2000, rateBps: 1400, commissionCents: 280, billableEvent: "COMPLETED" }); // delivery fee excluded

    const rej = await place(f, "rej", { deviceKey: "d-rej-aaaaaaaaaaaaaaa" }, { customer: { ...orderPayload(f, "z").customer, phone: "71 999 999" } });
    await restaurantOrderAction(f.restaurant.id, f.user.id, rej.order.id, "REJECT", { reason: "busy" });
    const can = await place(f, "can", { deviceKey: "d-can-aaaaaaaaaaaaaaa" });
    await customerCancelOrder(can.reference, { userId: null, deviceKey: "d-can-aaaaaaaaaaaaaaa" });
    expect(await prisma.commissionEvent.count()).toBe(1);
  });

  it("failed deliveries are not charged when billing on completion", async () => {
    const f = await makeRestaurant();
    const { order } = await place(f, "fail");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "FAIL", { reason: "Customer unreachable" });
    expect(await prisma.commissionEvent.count()).toBe(0);
  });

  it("auto-completes accepted orders left open and charges them", async () => {
    const f = await makeRestaurant();
    const { order } = await place(f, "auto");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
    await prisma.order.update({ where: { id: order.id }, data: { acceptedAt: new Date(Date.now() - 7 * 3600_000) } });
    expect(await autoCompleteStaleOrders(DEFAULT_SETTINGS)).toBe(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "COMPLETED", autoCompleted: true });
    expect(await prisma.commissionEvent.count()).toBe(1);
    expect(await autoCompleteStaleOrders(DEFAULT_SETTINGS)).toBe(0);
  });

  it("can bill on acceptance instead, using the restaurant's own rate snapshot", async () => {
    const f = await makeRestaurant({ rateBps: 1000 });
    await prisma.platformSetting.create({ data: { key: "billableEvent", value: "ACCEPTED" } });
    const { order } = await place(f, "h");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { commissionRateBps: 2000 } });
    const ev = await prisma.commissionEvent.findFirstOrThrow();
    expect(ev).toMatchObject({ commissionCents: 200, rateBps: 1000, billableEvent: "ACCEPTED" });
  });

  it("converts LBP orders with the stored exchange rate", async () => {
    const f = await makeRestaurant({ currency: "LBP" });
    const p = orderPayload(f, key("lbp"));
    p.items = [{ menuItemId: f.fries.id, quantity: 2, selections: {} }];
    const o = await createOrder(p, meta);
    const stored = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    expect(stored).toMatchObject({ exchangeRate: 89500, commissionBaseCents: 600, totalCents: 537000 + 179000 });
  });
});

describe("monthly billing & Whish settlement", () => {
  async function completedOrders(count: number) {
    const f = await makeRestaurant();
    for (let i = 0; i < count; i++) {
      const p = orderPayload(f, key(`m${i}`));
      const o = await createOrder({ ...p, customer: { ...p.customer, phone: `70 1${String(i).padStart(2, "0")} 456` } }, { ...meta, deviceKey: `dev-${i}-aaaaaaaaaaaaaaaa` });
      const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
      await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
      await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "COMPLETE");
    }
    await prisma.commissionEvent.updateMany({ data: { period: "2026-09" } });
    return f;
  }

  it("creates an itemized invoice for the month exactly once", async () => {
    const f = await completedOrders(3);
    const { invoice, created } = await generateInvoice(f.restaurant.id, "2026-09", null);
    expect(created).toBe(true);
    expect(invoice).toMatchObject({ orderCount: 3, grossSubtotalCents: 6000, grossCommissionCents: 840, totalDueCents: 840, status: "AWAITING_PAYMENT" });
    expect(await prisma.invoiceLine.count({ where: { invoiceId: invoice!.id } })).toBe(3);
    const again = await runMonthlyBilling("2026-09");
    expect(again.every((r) => !r.created)).toBe(true);
    expect(await prisma.invoice.count()).toBe(1);
  });

  it("refuses to invoice an open period", async () => {
    const f = await makeRestaurant();
    const now = new Date();
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    await expect(generateInvoice(f.restaurant.id, current, null)).rejects.toThrow(/not ended/);
  });

  it("keeps the invoice pending until an administrator verifies the Whish payment", async () => {
    const f = await completedOrders(1);
    const { invoice } = await generateInvoice(f.restaurant.id, "2026-09", null);
    const receipt = await prisma.mediaAsset.create({ data: { restaurantId: f.restaurant.id, kind: "RECEIPT", isPrivate: true, storageKey: "db", url: "/api/private-media/x", mimeType: "image/webp", sizeBytes: 10 } });
    const payment = await submitPayment({ restaurantId: f.restaurant.id, invoiceId: invoice!.id, userId: f.user.id, amountCents: 280, paymentDate: new Date(), whishReference: "WH-123456", evidenceAssetIds: [receipt.id] });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } })).status).toBe("PAYMENT_SUBMITTED");
    const admin = await prisma.user.create({ data: { email: "admin@test.dev", passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } });
    await reviewPayment(admin.id, payment.id, { action: "APPROVE", verifiedAmountCents: 200 });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } })).status).toBe("PARTIALLY_PAID");
    const p2 = await submitPayment({ restaurantId: f.restaurant.id, invoiceId: invoice!.id, userId: f.user.id, amountCents: 80, paymentDate: new Date(), whishReference: "WH-777", evidenceAssetIds: [] });
    await reviewPayment(admin.id, p2.id, { action: "APPROVE", verifiedAmountCents: 80 });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } })).status).toBe("PAID");
  });

  it("restaurant B cannot submit payment for restaurant A's invoice", async () => {
    const f = await completedOrders(1);
    const other = await makeRestaurant();
    const { invoice } = await generateInvoice(f.restaurant.id, "2026-09", null);
    await expect(submitPayment({ restaurantId: other.restaurant.id, invoiceId: invoice!.id, userId: other.user.id, amountCents: 280, paymentDate: new Date(), whishReference: "WH-1", evidenceAssetIds: [] })).rejects.toThrow(/not found/);
  });

  it("accepted disputes on invoiced orders become credits on the next invoice", async () => {
    const f = await completedOrders(2);
    const { invoice } = await generateInvoice(f.restaurant.id, "2026-09", null);
    const ev = await prisma.commissionEvent.findFirstOrThrow({ where: { invoiceId: invoice!.id } });
    const d = await openDispute({ restaurantId: f.restaurant.id, userId: f.user.id, commissionEventId: ev.id, reason: "Customer refused the order" });
    const admin = await prisma.user.create({ data: { email: "admin2@test.dev", passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } });
    await resolveDispute(admin.id, d.id, true, "Verified");
    expect((await prisma.commissionAdjustment.findFirstOrThrow()).amountCents).toBe(-280);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } })).totalDueCents).toBe(560);
  });
});
