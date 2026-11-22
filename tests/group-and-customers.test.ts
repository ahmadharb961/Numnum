import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/email", () => ({ sendEmail: async () => true, sendRichEmail: async () => true }));
vi.mock("@/server/push", () => ({ pushInLanguages: async () => 0, pushToRestaurantStaff: async () => 0, pushToUsers: async () => 0 }));

import { prisma } from "@/server/db";
import { cancelGroup, createGroup, groupState, joinGroup, leaveGroup, lockGroup, markGroupOrdered, removeMember, setMyLines, unlockGroup } from "@/server/group-carts";
import { listRestaurantCustomers, restaurantCustomersCsv } from "@/server/restaurant-customers";
import { offerRestaurants, offersCount } from "@/server/offers";
import { clearDealCache } from "@/server/deals";
import { exploreReelIds, exploreSearch } from "@/server/explore-search";
import { createOrder } from "@/server/orders";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

const line = (menuItemId: string, name: string, cents: number, qty = 1) => ({ menuItemId, name, imageUrl: null, unitBaseCents: cents, unitOptionsCents: 0, quantity: qty, selections: {}, summary: [], note: null, reelId: null });

describe("group ordering", () => {
  beforeEach(resetDb);

  it("host starts, friends join and add, everyone sees it; checkout locks it with names on friends' items", async () => {
    const f = await makeRestaurant();
    const host = { device: "dev-host-000000000001", userId: null };
    const rana = { device: "dev-rana-000000000001", userId: null };
    const karim = { device: "dev-karim-00000000001", userId: null };
    const code = await createGroup(host, { restaurantId: f.restaurant.id, name: "Ahmad", lines: [line(f.burger.id, "Double Smash Burger", 750)] });
    expect(code).toMatch(/^[a-z2-9]{8}$/);
    await joinGroup(code, rana, "Rana");
    await joinGroup(code, karim, "Karim");
    await setMyLines(code, rana, [line(f.fries.id, "French Fries", 300, 2)]);
    await setMyLines(code, karim, [line(f.burger.id, "Double Smash Burger", 750)]);

    const seen = await groupState(code, rana);
    expect(seen.hostName).toBe("Ahmad");
    expect(seen.isHost).toBe(false);
    expect(seen.members.map((m) => [m.name, m.isMe, m.lines.length])).toEqual([["Ahmad", false, 1], ["Rana", true, 1], ["Karim", false, 1]]);

    // Only the host can check out; a friend can't change items once it's locked.
    await expect(lockGroup(code, rana)).rejects.toThrow(/Only the person/);
    const locked = await lockGroup(code, host);
    expect(locked.lines.map((l) => l.note)).toEqual([null, "For Rana", "For Karim"]);
    await expect(setMyLines(code, rana, [])).rejects.toThrow(/placing the order/);
    await expect(joinGroup(code, { device: "dev-late-000000000001", userId: null }, "Late")).rejects.toThrow(/placing the order/);
    // Back from checkout: friends can change again.
    await unlockGroup(code, host);
    await setMyLines(code, rana, [line(f.fries.id, "French Fries", 300, 1)]);
    expect((await groupState(code, host)).status).toBe("OPEN");
  });

  it("the placed order closes the group; only the host's own order counts", async () => {
    const f = await makeRestaurant();
    const u = await makeCustomer();
    const host = { device: "dev-host-000000000002", userId: u.id };
    const friend = { device: "dev-friend-0000000002", userId: null };
    const code = await createGroup(host, { restaurantId: f.restaurant.id, name: "Ahmad", lines: [line(f.burger.id, "Double Smash Burger", 750)] });
    await joinGroup(code, friend, "Rana");
    await lockGroup(code, host);
    const other = await makeCustomer();
    const theirs = await createOrder(orderPayload(f, "group-other-order-xxxxxxxx"), { deviceKey: "dev-someone-else-0001", ipHash: null, userId: other.id });
    await expect(markGroupOrdered(code, host, theirs.reference)).rejects.toThrow(/not found/);
    const mine = await createOrder(orderPayload(f, "group-host-order-xxxxxxxxx"), { deviceKey: host.device, ipHash: null, userId: u.id });
    await markGroupOrdered(code, host, mine.reference);
    const s = await groupState(code, friend);
    expect(s.status).toBe("ORDERED");
    expect(s.order).toEqual({ reference: null }); // friends see it was placed, not the host's order link
    expect((await groupState(code, host)).order).toEqual({ reference: mine.reference });
    await expect(joinGroup(code, { device: "dev-late-000000000002", userId: null }, "Late")).rejects.toThrow(/already placed/);
  });

  it("names, sizes, remove/leave/cancel and expiry are checked", async () => {
    const f = await makeRestaurant();
    const host = { device: "dev-host-000000000003", userId: null };
    await expect(createGroup(host, { restaurantId: f.restaurant.id, name: "  ", lines: [] })).rejects.toThrow();
    const code = await createGroup(host, { restaurantId: f.restaurant.id, name: "Ahmad", lines: [] });
    const friend = { device: "dev-friend-0000000003", userId: null };
    await joinGroup(code, friend, "Rana");
    await expect(lockGroup(code, host)).rejects.toThrow(/Nobody has added/);
    await expect(setMyLines(code, friend, Array.from({ length: 21 }, (_, i) => line(f.fries.id, `x${i}`, 300)))).rejects.toThrow();
    await expect(setMyLines(code, { device: "dev-stranger-00000003", userId: null }, [])).rejects.toThrow(/Join the group/);
    const rana = (await groupState(code, host)).members.find((m) => m.name === "Rana")!;
    await expect(removeMember(code, friend, rana.id)).rejects.toThrow(/Only the person/);
    await removeMember(code, host, rana.id);
    await joinGroup(code, friend, "Rana");
    await leaveGroup(code, friend);
    expect((await groupState(code, host)).members).toHaveLength(1);
    await expect(leaveGroup(code, host)).rejects.toThrow(/cancel it instead/);
    await cancelGroup(code, host);
    expect((await groupState(code, host)).status).toBe("CANCELED");
    const old = await createGroup(host, { restaurantId: f.restaurant.id, name: "Ahmad", lines: [] });
    await prisma.groupCart.update({ where: { code: old }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await groupState(old, host)).status).toBe("EXPIRED");
    await expect(joinGroup(old, friend, "Rana")).rejects.toThrow(/ended/);
    await expect(groupState("nope1234", host)).rejects.toThrow(/isn't valid/);
  });
});

describe("group ordering with many people at once", () => {
  beforeEach(resetDb);

  it("24 join at the same moment (some tapping twice): all in, nobody twice, no errors; the 26th is refused", async () => {
    const f = await makeRestaurant();
    const host = { device: "dev-host-many-0000001", userId: null };
    const code = await createGroup(host, { restaurantId: f.restaurant.id, name: "Host", lines: [line(f.burger.id, "Double Smash Burger", 750)] });
    const friends = Array.from({ length: 24 }, (_, i) => ({ device: `dev-friend-many-${String(i).padStart(4, "0")}`, userId: null }));
    // Every friend joins, and every third one taps Join twice at once.
    const joins = friends.flatMap((v, i) => (i % 3 === 0 ? [joinGroup(code, v, `Friend ${i}`), joinGroup(code, v, `Friend ${i}`)] : [joinGroup(code, v, `Friend ${i}`)]));
    const res = await Promise.allSettled(joins);
    expect(res.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
    const s = await groupState(code, host);
    expect(s.members).toHaveLength(25);
    expect(new Set(s.members.map((m) => m.name)).size).toBe(25);
    await expect(joinGroup(code, { device: "dev-one-too-many-0001", userId: null }, "Late")).rejects.toThrow(/up to/);
  });

  it("everyone adds at once while the host checks out: every saved item is in the order, the rest are refused", async () => {
    const f = await makeRestaurant();
    const host = { device: "dev-host-race-0000001", userId: null };
    const code = await createGroup(host, { restaurantId: f.restaurant.id, name: "Host", lines: [line(f.burger.id, "Double Smash Burger", 750)] });
    const friends = Array.from({ length: 19 }, (_, i) => ({ device: `dev-friend-race-${String(i).padStart(4, "0")}`, userId: null }));
    await Promise.all(friends.map((v, i) => joinGroup(code, v, `F${i}`)));
    const adds = friends.map((v) => setMyLines(code, v, [line(f.fries.id, "French Fries", 300, 1)]).then(() => "saved", (e) => String(e)));
    const lock = lockGroup(code, host);
    const [results, locked] = await Promise.all([Promise.all(adds), lock]);
    expect(results.every((r) => r === "saved" || /placing the order/.test(r))).toBe(true);
    // Nothing saved but left out: every friend whose item was saved has it in the locked order.
    const saved = results.filter((r) => r === "saved").length;
    expect(locked.lines.filter((l) => l.note?.startsWith("For F")).length).toBe(saved);
    const inDb = (await groupState(code, host)).members.filter((m) => !m.isHost && m.lines.length).length;
    expect(inDb).toBe(saved);
  });
});

describe("restaurant customers (Dashboard → Customers)", () => {
  beforeEach(resetDb);

  it("one row per customer: latest name and address, completed orders counted, CSV download", async () => {
    const f = await makeRestaurant();
    const place = async (key: string, customer: Record<string, unknown>, status: "COMPLETED" | "REJECTED") => {
      const p = orderPayload(f, key);
      const buyer = await makeCustomer();
      const o = await createOrder({ ...p, customer: { ...p.customer, ...customer } }, { deviceKey: `dev-${key}`, ipHash: null, userId: buyer.id });
      await prisma.order.update({ where: { reference: o.reference }, data: { status } });
    };
    await place("cust-order-aaaaaaaaaaaaaaa1", { name: "Rana H", phone: "70 111 222", address: "Hamra, Bliss St" }, "COMPLETED");
    await place("cust-order-aaaaaaaaaaaaaaa2", { name: "Rana Haddad", phone: "70 111 222", address: "Verdun, Rashid Karami St" }, "COMPLETED");
    await place("cust-order-aaaaaaaaaaaaaaa3", { name: "=HYPERLINK(1)", phone: "71 333 444" }, "COMPLETED");
    await place("cust-order-aaaaaaaaaaaaaaa4", { name: "Not A Customer", phone: "76 555 666" }, "REJECTED");

    const { customers, total } = await listRestaurantCustomers(f.restaurant.id);
    expect(total).toBe(2);
    expect(customers[0]).toMatchObject({ name: "Rana Haddad", phone: "96170111222", orders: 2 });
    expect(customers[0].address).toContain("Verdun");
    expect((await listRestaurantCustomers(f.restaurant.id, "111")).total).toBe(1);
    expect((await listRestaurantCustomers(f.restaurant.id, "rana")).customers[0].name).toBe("Rana Haddad");

    const csv = await restaurantCustomersCsv(f.restaurant.id, "USD");
    const rows = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
    expect(rows[0]).toBe("Name,Phone,Address,Area,Orders,Total spent (USD),First order,Last order");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain("Rana Haddad");
    expect(rows[1]).toContain(",2,");
    expect(rows.join("\n")).toContain("'=HYPERLINK(1)"); // a formula-looking name stays plain text in Excel
    // Another restaurant's customers never show.
    const other = await makeRestaurant();
    expect((await listRestaurantCustomers(other.restaurant.id)).total).toBe(0);
  });
});

describe("NumOffers and the explore price filter", () => {
  beforeEach(async () => {
    await resetDb();
    clearDealCache();
  });

  it("lists restaurants with a live deal, with the dishes it makes cheaper", async () => {
    const a = await makeRestaurant({ name: "Deal Burger" });
    const b = await makeRestaurant({ name: "No Deal Grill" });
    await prisma.deal.create({ data: { restaurantId: a.restaurant.id, kind: "PERCENT_OFF", percent: 20, menuItemId: a.burger.id } });
    await prisma.deal.create({ data: { restaurantId: b.restaurant.id, kind: "PERCENT_OFF", percent: 50, endedAt: new Date() } });
    clearDealCache();
    expect(await offersCount([])).toBe(1);
    const list = await offerRestaurants([], null);
    expect(list.map((r) => r.displayName)).toEqual(["Deal Burger"]);
    expect(list[0].dishes[0]).toMatchObject({ name: "Double Smash Burger", priceCents: 750, dealPriceCents: 600 });
    expect(await offerRestaurants([a.restaurant.id], null)).toEqual([]); // blocked by the viewer
  });

  it("a price range in dollars finds dishes priced in LBP by their dollar value, and the reel viewer gets exactly the results", async () => {
    const usd = await makeRestaurant();
    const lbp = await makeRestaurant({ currency: "LBP" }); // burger 671,250 LBP ≈ $7.50, fries 268,500 LBP = $3.00
    const v = await prisma.mediaAsset.create({ data: { restaurantId: null, kind: "VIDEO", storageKey: "v/x.mp4", url: "", mimeType: "video/mp4", sizeBytes: 1 } });
    const reel = (r: { id: string }, menuItemId: string, views: number) => prisma.reel.create({ data: { restaurantId: r.id, menuItemId, videoAssetId: v.id, status: "READY", visibility: "PUBLISHED", viewCount: views } });
    const r1 = await reel(usd.restaurant, usd.fries.id, 30); // $3.00
    await reel(usd.restaurant, usd.burger.id, 20); // $7.50
    const r3 = await reel(lbp.restaurant, lbp.fries.id, 10); // 268,500 LBP = $3.00
    await reel(lbp.restaurant, lbp.burger.id, 5);
    const p = { type: "reels" as const, minPrice: 3, maxPrice: 5, page: 1, lbpPerUsd: 89_500 };
    const res = await exploreSearch(p, null);
    expect(res.counts.reels).toBe(2);
    expect(res.reels!.map((r) => r.id)).toEqual([r1.id, r3.id]);
    expect(res.reels![1]).toMatchObject({ priceCents: 268500, currency: "LBP", restaurantName: lbp.restaurant.displayName });
    expect(await exploreReelIds(p, 100)).toEqual([r1.id, r3.id]); // same results, same order, for swiping
    expect((await exploreSearch({ ...p, type: "dishes" }, null)).counts.dishes).toBe(2);
  });
});
