import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createOrder, restaurantOrderAction } from "@/server/orders";
import { parseRange, reelInsight, reelsPerformance } from "@/server/insights";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

async function reelFor(restaurantId: string, menuItemId: string) {
  const asset = await prisma.mediaAsset.create({ data: { restaurantId, kind: "VIDEO", storageKey: "stream:x", url: "", mimeType: "video/*", sizeBytes: 1 } });
  return prisma.reel.create({ data: { restaurantId, menuItemId, videoAssetId: asset.id, status: "READY", visibility: "PUBLISHED", publishedAt: new Date() } });
}

describe("reel insights", () => {
  it("attributes views, funnel steps, orders and completed revenue to the right reel", async () => {
    const f = await makeRestaurant();
    const a = await reelFor(f.restaurant.id, f.burger.id);
    const b = await reelFor(f.restaurant.id, f.fries.id);
    await prisma.reelView.createMany({ data: [...Array(10)].map((_, i) => ({ reelId: a.id, viewerKey: `v${i % 4}`, watchMs: 3000 })) });
    await prisma.reelView.createMany({ data: [...Array(5)].map((_, i) => ({ reelId: b.id, viewerKey: `w${i}`, watchMs: 6000 })) });
    await prisma.analyticsEvent.createMany({
      data: [
        { type: "product_opened", reelId: a.id, restaurantId: f.restaurant.id },
        { type: "product_opened", reelId: a.id, restaurantId: f.restaurant.id },
        { type: "add_to_cart", reelId: a.id, restaurantId: f.restaurant.id },
        { type: "reel_shared", reelId: b.id, restaurantId: f.restaurant.id },
      ],
    });
    const c = await makeCustomer();
    const p = orderPayload(f, "reel-attr-key-xxxxxxxxxxxxx");
    p.items[0] = { ...p.items[0], reelId: a.id } as never;
    const o = await createOrder(p, { deviceKey: null, ipHash: null, userId: c.id });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "COMPLETE");

    const range = parseRange({ days: "7" });
    const perf = await reelsPerformance(f.restaurant.id, range);
    expect(perf.map((r) => r.id)).toEqual([a.id, b.id]); // sorted by views
    expect(perf[0]).toMatchObject({ views: 10, uniqueViewers: 4, avgWatchSec: 3, productOpens: 2, addToCarts: 1, orders: 1, completedOrders: 1, revenueCents: 2200, conversion: 0.1 });
    expect(perf[1]).toMatchObject({ views: 5, shares: 1, orders: 0, revenueCents: 0 });

    const one = await reelInsight(f.restaurant.id, a.id, range);
    expect(one).toMatchObject({ rank: 1, reelCount: 2, average: { views: 7.5 } });
    expect(one.days.reduce((s, d) => s + d.views, 0)).toBe(10);
    expect(one.days.reduce((s, d) => s + d.orders, 0)).toBe(1);
  });

  it("does not show another restaurant's reels", async () => {
    const f = await makeRestaurant();
    const g = await makeRestaurant();
    const r = await reelFor(g.restaurant.id, g.burger.id);
    expect(await reelsPerformance(f.restaurant.id, parseRange({}))).toEqual([]);
    expect((await reelInsight(f.restaurant.id, r.id, parseRange({}))).reel).toBeNull();
  });
});
