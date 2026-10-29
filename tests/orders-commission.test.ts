import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createOrder, recordHandoff, restaurantOrderAction, OrderError } from "@/server/orders";
import { generateInvoice, reviewPayment, submitPayment, openDispute, resolveDispute, runMonthlyBilling } from "@/server/billing";
import { makeRestaurant, orderPayload, resetDb } from "./helpers";

const meta = { deviceKey: "device-aaaaaaaaaaaaaaaa", ipHash: null };
const key = (s: string) => `test-key-${s}-${"x".repeat(16)}`;

beforeEach(async () => {
  await resetDb();
});

describe("guest ordering", () => {
  it("prices server-side and builds the WhatsApp message", async () => {
    const f = await makeRestaurant();
    const o = await createOrder(orderPayload(f, key("a")), meta);
    expect(o.subtotalCents).toBe(2000); // 2 × (7.50 + 1.00) + 3.00
    expect(o.reference).toMatch(/^NN-\d{4}-\d{6}$/);
    expect(o.whatsappUrl.startsWith("https://wa.me/96170123456?text=")).toBe(true);
    expect(o.message).toContain("Line total: $17.00");
    expect(o.message).toContain("ITEM SUBTOTAL: $20.00");
    expect(o.message).toContain("Google Maps: https://maps.google.com/?q=33.895900,35.478700");
    const stored = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference }, include: { items: { include: { customizations: true } } } });
    expect(stored.status).toBe("LINK_GENERATED");
    expect(stored.items[0].customizations.map((c) => c.optionName).sort()).toEqual(["BBQ sauce", "Extra cheese"]);
  });

  it("ignores client-supplied prices and rejects missing required choices", async () => {
    const f = await makeRestaurant();
    const p = orderPayload(f, key("b"));
    (p.items[0] as Record<string, unknown>).priceCents = 1;
    p.items[0].selections = { [f.extras.id]: [] } as never;
    await expect(createOrder(p, meta)).rejects.toBeInstanceOf(OrderError);
  });

  it("rejects items from another restaurant", async () => {
    const a = await makeRestaurant();
    const b = await makeRestaurant();
    const p = orderPayload(a, key("c"));
    p.items[1].menuItemId = b.fries.id;
    await expect(createOrder(p, meta)).rejects.toThrow(/check your order/);
  });

  it("is idempotent for repeated submissions but allows legitimate new orders", async () => {
    const f = await makeRestaurant();
    const first = await createOrder(orderPayload(f, key("d")), meta);
    const again = await createOrder(orderPayload(f, key("d")), meta);
    expect(again.reference).toBe(first.reference);
    const second = await createOrder(orderPayload(f, key("e")), meta);
    expect(second.reference).not.toBe(first.reference);
    expect(await prisma.order.count()).toBe(2);
    const flagged = await prisma.order.findUniqueOrThrow({ where: { reference: second.reference } });
    expect(flagged.suspicious).toBe(true); // same device+subtotal within minutes is flagged, not blocked
  });

  it("enforces the LBP exchange-rate snapshot for commission base", async () => {
    const f = await makeRestaurant({ currency: "LBP" });
    const p = orderPayload(f, key("lbp"));
    p.items = [{ menuItemId: f.fries.id, quantity: 2, selections: {} }];
    const o = await createOrder(p, meta);
    const stored = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    expect(stored.exchangeRate).toBe(89500);
    expect(stored.commissionBaseCents).toBe(600); // 537,000 LBP / 89,500 = $6.00
  });
});

describe("commission integrity", () => {
  it("a $20 order generates exactly one $2.80 commission at 14% on acknowledgment", async () => {
    const f = await makeRestaurant();
    const o = await createOrder(orderPayload(f, key("f")), meta);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    // repeated WhatsApp openings never create commission
    for (let i = 0; i < 5; i++) await recordHandoff(o.reference, meta.deviceKey);
    expect(await prisma.commissionEvent.count()).toBe(0);
    const h = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(h.status).toBe("HANDOFF_ATTEMPTED");
    expect(h.handoffCount).toBe(5);

    await Promise.all([1, 2, 3].map(() => restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACKNOWLEDGE")));
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "FULFILL");
    const events = await prisma.commissionEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ baseCents: 2000, rateBps: 1400, commissionCents: 280, billableEvent: "ACKNOWLEDGED" });
  });

  it("restaurant A cannot act on restaurant B's orders", async () => {
    const a = await makeRestaurant();
    const b = await makeRestaurant();
    const o = await createOrder(orderPayload(b, key("g")), meta);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    await expect(restaurantOrderAction(a.restaurant.id, a.user.id, order.id, "ACKNOWLEDGE")).rejects.toThrow(/not found/);
    expect(await prisma.commissionEvent.count()).toBe(0);
  });

  it("uses restaurant-specific rate when configured and snapshots it", async () => {
    const f = await makeRestaurant({ rateBps: 1000 });
    const o = await createOrder(orderPayload(f, key("h")), meta);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACKNOWLEDGE");
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { commissionRateBps: 2000 } });
    await prisma.menuItem.update({ where: { id: f.burger.id }, data: { priceCents: 9999 } });
    const ev = await prisma.commissionEvent.findFirstOrThrow();
    expect(ev.commissionCents).toBe(200);
    expect(ev.rateBps).toBe(1000);
  });
});

describe("monthly billing & Whish settlement", () => {
  async function acknowledgedOrders(count: number) {
    const f = await makeRestaurant();
    for (let i = 0; i < count; i++) {
      const o = await createOrder(orderPayload(f, key(`m${i}`)), { ...meta, deviceKey: `dev-${i}-aaaaaaaaaaaaaaaa` });
      const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
      await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACKNOWLEDGE");
    }
    // move the billable events into last month
    await prisma.commissionEvent.updateMany({ data: { period: "2026-09" } });
    return f;
  }

  it("creates an itemized invoice for the month exactly once", async () => {
    const f = await acknowledgedOrders(3);
    const { invoice, created } = await generateInvoice(f.restaurant.id, "2026-09", null);
    expect(created).toBe(true);
    expect(invoice).toMatchObject({ orderCount: 3, grossSubtotalCents: 6000, grossCommissionCents: 840, totalDueCents: 840, status: "AWAITING_PAYMENT" });
    expect(invoice!.number).toMatch(/^NN-INV-\d{4}-\d{5}$/);
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: invoice!.id } });
    expect(lines).toHaveLength(3);
    const again = await runMonthlyBilling("2026-09");
    expect(again.every((r) => !r.created)).toBe(true);
    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.commissionEvent.count({ where: { status: "INVOICED" } })).toBe(3);
  });

  it("refuses to invoice an open period", async () => {
    const f = await makeRestaurant();
    const now = new Date();
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    await expect(generateInvoice(f.restaurant.id, current, null)).rejects.toThrow(/not ended/);
  });

  it("keeps invoice pending until an administrator verifies the Whish payment", async () => {
    const f = await acknowledgedOrders(1);
    const { invoice } = await generateInvoice(f.restaurant.id, "2026-09", null);
    const receipt = await prisma.mediaAsset.create({ data: { restaurantId: f.restaurant.id, kind: "RECEIPT", isPrivate: true, storageKey: "r/x.webp", url: "/api/private-media/x", mimeType: "image/webp", sizeBytes: 10 } });
    const payment = await submitPayment({ restaurantId: f.restaurant.id, invoiceId: invoice!.id, userId: f.user.id, amountCents: 280, paymentDate: new Date(), whishReference: "WH-123456", evidenceAssetIds: [receipt.id] });
    let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } });
    expect(inv.status).toBe("PAYMENT_SUBMITTED");
    expect(inv.paidCents).toBe(0);

    const admin = await prisma.user.create({ data: { email: "admin@test.dev", passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } });
    await reviewPayment(admin.id, payment.id, { action: "APPROVE", verifiedAmountCents: 200 });
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } });
    expect(inv.status).toBe("PARTIALLY_PAID");

    await expect(submitPayment({ restaurantId: f.restaurant.id, invoiceId: invoice!.id, userId: f.user.id, amountCents: 80, paymentDate: new Date(), whishReference: "WH-123456", evidenceAssetIds: [] })).rejects.toThrow(/already been submitted/);
    const p2 = await submitPayment({ restaurantId: f.restaurant.id, invoiceId: invoice!.id, userId: f.user.id, amountCents: 80, paymentDate: new Date(), whishReference: "WH-777", evidenceAssetIds: [] });
    await reviewPayment(admin.id, p2.id, { action: "APPROVE", verifiedAmountCents: 80 });
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } });
    expect(inv.status).toBe("PAID");
    expect(await prisma.auditLog.count({ where: { action: "payment.approve" } })).toBe(2);
  });

  it("restaurant B cannot submit payment for restaurant A's invoice", async () => {
    const f = await acknowledgedOrders(1);
    const other = await makeRestaurant();
    const { invoice } = await generateInvoice(f.restaurant.id, "2026-09", null);
    await expect(submitPayment({ restaurantId: other.restaurant.id, invoiceId: invoice!.id, userId: other.user.id, amountCents: 280, paymentDate: new Date(), whishReference: "WH-1", evidenceAssetIds: [] })).rejects.toThrow(/not found/);
  });

  it("accepted disputes on invoiced orders become credits on the next invoice", async () => {
    const f = await acknowledgedOrders(2);
    const { invoice } = await generateInvoice(f.restaurant.id, "2026-09", null);
    const ev = await prisma.commissionEvent.findFirstOrThrow({ where: { invoiceId: invoice!.id } });
    const d = await openDispute({ restaurantId: f.restaurant.id, userId: f.user.id, commissionEventId: ev.id, reason: "Customer never ordered" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } })).status).toBe("DISPUTED");
    const admin = await prisma.user.create({ data: { email: "admin2@test.dev", passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } });
    await resolveDispute(admin.id, d.id, true, "Verified duplicate");
    const adj = await prisma.commissionAdjustment.findFirstOrThrow();
    expect(adj.amountCents).toBe(-280);
    // invoice itself is not silently altered
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } })).totalDueCents).toBe(560);
  });
});
