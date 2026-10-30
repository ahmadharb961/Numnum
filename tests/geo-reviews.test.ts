import { beforeEach, describe, expect, it } from "vitest";
import { distanceKm, normalizeZones, quoteDelivery } from "@/lib/geo";
import { prisma } from "@/server/db";
import { createOrder, restaurantOrderAction } from "@/server/orders";
import { pendingOrderReview, submitOrderReview } from "@/server/reviews";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

describe("geo", () => {
  it("measures straight-line distance", () => {
    expect(distanceKm({ lat: 33.8959, lng: 35.4787 }, { lat: 34.4367, lng: 35.8497 })).toBeCloseTo(69.1, 0); // Hamra → Tripoli
    expect(distanceKm({ lat: 33.9, lng: 35.5 }, { lat: 33.9, lng: 35.5 })).toBe(0);
  });
  it("sorts and validates zones", () => {
    expect(normalizeZones([{ maxKm: 6, feeCents: 250 }, { maxKm: 3, feeCents: 150 }, { maxKm: -1, feeCents: 1 }, { maxKm: 2, feeCents: 1.5 }])).toEqual([
      { maxKm: 2, feeCents: 2 },
      { maxKm: 3, feeCents: 150 },
      { maxKm: 6, feeCents: 250 },
    ]);
    expect(normalizeZones("nope")).toEqual([]);
  });
  it("quotes by zone, or explains why delivery isn't possible", () => {
    const r = { latitude: 33.8959, longitude: 35.4787, deliveryZones: [{ maxKm: 3, feeCents: 150 }, { maxKm: 6, feeCents: 250 }] };
    expect(quoteDelivery(r, { lat: 33.8995, lng: 35.4807 })).toMatchObject({ deliverable: true, feeCents: 150 });
    expect(quoteDelivery(r, { lat: 33.8869, lng: 35.5197 })).toMatchObject({ deliverable: true, feeCents: 250 });
    expect(quoteDelivery(r, { lat: 34.4367, lng: 35.8497 })).toMatchObject({ deliverable: false, reason: "out_of_range", maxKm: 6 });
    expect(quoteDelivery(r, null)).toMatchObject({ deliverable: false, reason: "no_location" });
    expect(quoteDelivery({ ...r, latitude: null }, { lat: 33.9, lng: 35.5 })).toMatchObject({ deliverable: false, reason: "no_zones" });
  });
});

describe("post-delivery rating prompt", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("asks once the order is delivered, saves dish + restaurant ratings as verified, then stops asking", async () => {
    const f = await makeRestaurant();
    const c = await makeCustomer();
    const user = { id: c.id, email: c.email, name: c.name, phone: null, roles: ["CUSTOMER" as const] };
    const o = await createOrder(orderPayload(f, "rate-key-xxxxxxxxxxxxxxxx"), { deviceKey: "dev-rate-aaaaaaaaaaaa", ipHash: null, userId: c.id });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    expect(await pendingOrderReview(c.id)).toBeNull(); // not delivered yet
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "COMPLETE");
    const pending = await pendingOrderReview(c.id);
    expect(pending).toMatchObject({ reference: o.reference, restaurant: { id: f.restaurant.id } });
    expect(pending!.items.map((i) => i.name).sort()).toEqual(["Double Smash Burger", "French Fries"]);
    await submitOrderReview(user, o.reference, { restaurant: { rating: 5, service: 4 }, items: [{ menuItemId: f.burger.id, rating: 5 }, { menuItemId: f.fries.id, rating: 4 }] });
    expect(await prisma.itemReview.findFirstOrThrow({ where: { menuItemId: f.burger.id } })).toMatchObject({ rating: 5, evidence: "COMPLETED_ORDER" });
    expect(await prisma.restaurantReview.findFirstOrThrow({ where: { restaurantId: f.restaurant.id } })).toMatchObject({ rating: 5, service: 4, evidence: "COMPLETED_ORDER" });
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: f.restaurant.id } })).ratingAvg).toBe(5);
    expect(await pendingOrderReview(c.id)).toBeNull();
  });

  it("can't rate someone else's order", async () => {
    const f = await makeRestaurant();
    const a = await makeCustomer();
    const b = await makeCustomer();
    const o = await createOrder(orderPayload(f, "rate-key2-xxxxxxxxxxxxxxx"), { deviceKey: null, ipHash: null, userId: a.id });
    await expect(submitOrderReview({ id: b.id, email: b.email, name: b.name, phone: null, roles: ["CUSTOMER"] }, o.reference, { items: [{ menuItemId: f.burger.id, rating: 1 }] })).rejects.toThrow(/not found/);
  });
});
