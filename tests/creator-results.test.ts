import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/email", () => ({ sendEmail: async () => true, sendRichEmail: async () => true }));
vi.mock("@/server/push", () => ({ pushInLanguages: async () => 0, pushToRestaurantStaff: async () => 0, pushToUsers: async () => 0 }));

import { prisma } from "@/server/db";
import { creatorResults, recentCreatorOrders, sharingCreators } from "@/server/creator-results";
import { createOrder } from "@/server/orders";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

async function creatorWithReel(f: Awaited<ReturnType<typeof makeRestaurant>>, handle: string, share = false) {
  const u = await makeCustomer();
  const c = await prisma.creator.create({ data: { userId: u.id, handle, displayName: handle, status: "APPROVED", approvedAt: new Date(), shareResults: share, searchName: handle, searchText: handle } });
  const v = await prisma.mediaAsset.create({ data: { restaurantId: null, kind: "VIDEO", storageKey: `v/${handle}.mp4`, url: "", mimeType: "video/mp4", sizeBytes: 1, uploadedById: u.id } });
  const reel = await prisma.reel.create({ data: { restaurantId: f.restaurant.id, menuItemId: f.burger.id, videoAssetId: v.id, creatorId: c.id, tagStatus: "ACCEPTED", status: "READY", visibility: "PUBLISHED", publishedAt: new Date() } });
  return { c, reel };
}

let k = 0;
async function orderFrom(f: Awaited<ReturnType<typeof makeRestaurant>>, reelId: string | null, status: "COMPLETED" | "REJECTED" | "PLACED") {
  const buyer = await makeCustomer();
  const p = orderPayload(f, `results-order-${++k}-xxxxxxxxxxxxxx`);
  const o = await createOrder({ ...p, items: p.items.map((i) => ({ ...i, reelId })) }, { deviceKey: `dev-results-${k}`, ipHash: null, userId: buyer.id });
  await prisma.order.update({ where: { reference: o.reference }, data: { status } });
  return o;
}

describe("creator results (proof for restaurants)", () => {
  beforeEach(resetDb);

  it("counts only orders placed from the creator's reels: completed, rate per 1,000 views, per restaurant, sales", async () => {
    const a = await makeRestaurant({ name: "Burger A" });
    const b = await makeRestaurant({ name: "Grill B" });
    const { c, reel } = await creatorWithReel(a, "rana.eats");
    const reelB = await prisma.reel.create({ data: { restaurantId: b.restaurant.id, menuItemId: b.burger.id, videoAssetId: reel.videoAssetId, creatorId: c.id, tagStatus: "ACCEPTED", status: "READY", visibility: "PUBLISHED" } });
    await orderFrom(a, reel.id, "COMPLETED");
    await orderFrom(a, reel.id, "COMPLETED");
    await orderFrom(a, reel.id, "REJECTED"); // not counted as completed
    await orderFrom(b, reelB.id, "COMPLETED");
    await orderFrom(a, null, "COMPLETED"); // not from a reel: not theirs
    // 3,000 views of their reels.
    await prisma.reelView.createMany({ data: Array.from({ length: 3000 }, (_, i) => ({ reelId: i < 2000 ? reel.id : reelB.id, viewerKey: `v${i}`, watchMs: 3000 })) });

    const r = await creatorResults(c.id);
    expect(r.totals.completedOrders).toBe(3);
    expect(r.totals.orders).toBe(4);
    expect(r.totals.views).toBe(3000);
    expect(r.totals.ordersPer1000Views).toBe(1); // 3 completed / 3,000 views
    expect(r.totals.restaurants).toBe(2);
    expect(r.restaurants.map((x) => [x.name, x.completed])).toEqual([["Burger A", 2], ["Grill B", 1]]);
    expect(r.totals.salesUsdCents).toBeGreaterThan(0);
    expect(r.totals.avgOrderUsdCents).toBe(Math.round(r.totals.salesUsdCents / 3));

    const recent = await recentCreatorOrders(c.id);
    expect(recent).toHaveLength(4);
    expect(recent.every((o) => o.dishes.includes("Double Smash Burger"))).toBe(true);
    expect(Object.keys(recent[0])).not.toContain("customerPhone"); // no customer details
  });

  it("Find creators lists only creators who chose to share, most orders first", async () => {
    const f = await makeRestaurant();
    const top = await creatorWithReel(f, "top.eats", true);
    const low = await creatorWithReel(f, "low.eats", true);
    await creatorWithReel(f, "private.eats", false);
    await orderFrom(f, top.reel.id, "COMPLETED");
    await orderFrom(f, top.reel.id, "COMPLETED");
    await orderFrom(f, low.reel.id, "COMPLETED");
    const list = await sharingCreators();
    expect(list.map((c) => [c.handle, c.results.completedOrders])).toEqual([["top.eats", 2], ["low.eats", 1]]);
  });
});
