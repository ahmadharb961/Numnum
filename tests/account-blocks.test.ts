import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/passwords";
import { deleteAccount, deletionBlocker } from "@/server/account-deletion";
import { block, listBlocks, unblock } from "@/server/blocks";
import { searchRestaurants } from "@/server/search";
import { createOrder, restaurantOrderAction } from "@/server/orders";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

const key = (s: string) => `acct-key-${s}-${"x".repeat(16)}`;

beforeEach(async () => {
  await resetDb();
});

async function customerWithPassword() {
  const c = await makeCustomer();
  await prisma.user.update({ where: { id: c.id }, data: { passwordHash: await hashPassword("secretpass1") } });
  return c;
}

describe("delete my account", () => {
  it("removes personal data, keeps the orders anonymous, recomputes ratings", async () => {
    const f = await makeRestaurant();
    const c = await customerWithPassword();
    const o = await createOrder(orderPayload(f, key("a")), { deviceKey: "dev-acct-aaaaaaaaaaaaaa", ipHash: null, userId: c.id });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT", { etaMinutes: 20 });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "COMPLETE");
    await prisma.restaurantReview.create({ data: { restaurantId: f.restaurant.id, userId: c.id, rating: 1 } });
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { ratingAvg: 1, ratingCount: 1 } });
    await prisma.savedItem.create({ data: { ownerKey: `u:${c.id}`, type: "RESTAURANT", refId: f.restaurant.id } });

    expect(await deleteAccount(c.id, "wrong")).toEqual({ ok: false, error: "Incorrect password" });
    expect(await deleteAccount(c.id, "secretpass1")).toEqual({ ok: true });

    expect(await prisma.user.findUnique({ where: { id: c.id } })).toBeNull();
    const kept = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { commission: true } });
    expect(kept).toMatchObject({ userId: null, customerName: "Deleted customer", customerPhone: "", address: null, latitude: null });
    expect(kept.commission).not.toBeNull(); // invoices stay correct
    expect(await prisma.restaurantReview.count({ where: { restaurantId: f.restaurant.id } })).toBe(0);
    expect(await prisma.restaurant.findUniqueOrThrow({ where: { id: f.restaurant.id } })).toMatchObject({ ratingCount: 0 });
    expect(await prisma.savedItem.count({ where: { ownerKey: `u:${c.id}` } })).toBe(0);
  });

  it("waits for an order in progress, and sends restaurant owners to a closure request", async () => {
    const f = await makeRestaurant();
    const c = await customerWithPassword();
    await createOrder(orderPayload(f, key("b")), { deviceKey: "dev-acct-bbbbbbbbbbbbbb", ipHash: null, userId: c.id });
    expect(await deletionBlocker(c.id)).toEqual({ ok: false, reason: "open_order" });
    expect(await deleteAccount(c.id, "secretpass1")).toMatchObject({ ok: false, error: expect.stringMatching(/order in progress/) });
    expect(await deletionBlocker(f.user.id)).toMatchObject({ ok: false, reason: "owner" });
  });
});

describe("blocking", () => {
  it("hides a blocked restaurant from listings, and can be undone", async () => {
    const a = await makeRestaurant({ name: "Alpha Grill" });
    const b = await makeRestaurant({ name: "Beta Pizza" });
    const c = await makeCustomer();
    expect(await block(c.id, { restaurantId: a.restaurant.id })).toEqual({ kind: "restaurant", name: "Alpha Grill" });
    const blocks = await listBlocks(c.id);
    expect(blocks).toMatchObject([{ label: "Alpha Grill", kind: "restaurant" }]);
    const ids = blocks.length ? [a.restaurant.id] : [];
    const list = await searchRestaurants({ blockedIds: ids });
    const names = list.map((r) => r.displayName);
    expect(names).toContain("Beta Pizza");
    expect(names).not.toContain("Alpha Grill");
    await unblock(c.id, blocks[0].id);
    expect(await listBlocks(c.id)).toEqual([]);
    void b;
  });

  it("blocks the author of a review, never yourself, and only your own blocks can be removed", async () => {
    const f = await makeRestaurant();
    const c = await makeCustomer();
    const author = await makeCustomer();
    const rv = await prisma.restaurantReview.create({ data: { restaurantId: f.restaurant.id, userId: author.id, rating: 1, body: "rude text" } });
    const mine = await prisma.restaurantReview.create({ data: { restaurantId: f.restaurant.id, userId: c.id, rating: 5 } });
    expect(await block(c.id, { reviewId: mine.id, reviewType: "RESTAURANT" })).toBeNull();
    expect(await block(c.id, { reviewId: rv.id, reviewType: "RESTAURANT" })).toMatchObject({ kind: "user" });
    const [bl] = await listBlocks(c.id);
    await unblock(author.id, bl.id); // someone else can't remove it
    expect(await listBlocks(c.id)).toHaveLength(1);
  });
});
