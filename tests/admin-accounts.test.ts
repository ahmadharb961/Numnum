import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createCustomerByAdmin, createRestaurantByAdmin, setCommissionForRestaurants } from "@/server/admin-accounts";
import { createOrder, restaurantOrderAction } from "@/server/orders";
import { updateSetting } from "@/server/settings";
import { verifyPassword } from "@/server/passwords";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

let adminId: string;
beforeEach(async () => {
  await resetDb();
  adminId = (await prisma.user.create({ data: { email: "admin@test.dev", passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } })).id;
});

const base = { displayName: "Beit Saj", phone: "70 111 222", ownerName: "Rami", ownerEmail: "rami@beitsaj.test", ownerPassword: "temp-pass-1", latitude: 33.8995, longitude: 35.4807, deliveryKm: 5, deliveryFee: "1.5", live: true, agreementSigned: true };

/** Places an order and walks it to COMPLETED; returns its commission entry. */
async function completedOrderCommission(f: Awaited<ReturnType<typeof makeRestaurant>>, n: number) {
  const user = await makeCustomer();
  const o = await createOrder(orderPayload(f, `admin-acc-${n}-xxxxxxxxxxxxxxxx`), { deviceKey: `dev-admin-${n}-aaaaaaaaaa`, ipHash: null, userId: user.id });
  const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
  for (const a of ["ACCEPT", "DISPATCH", "COMPLETE"] as const) await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, a, { etaMinutes: 30 });
  return prisma.commissionEvent.findUniqueOrThrow({ where: { orderId: order.id } });
}

describe("admin: create restaurant", () => {
  it("creates a live restaurant with its owner, delivery zone and own commission", async () => {
    const r = await createRestaurantByAdmin(adminId, { ...base, commissionRate: "15", verified: true });
    expect(r.ok).toBe(true);
    const rest = await prisma.restaurant.findUniqueOrThrow({ where: { id: (r as { id: string }).id }, include: { staff: { include: { user: true } } } });
    expect(rest).toMatchObject({ status: "ACTIVE", orderingEnabled: true, commissionRateBps: 1500, verificationStatus: "APPROVED", phone: "96170111222", deliveryZones: [{ maxKm: 5, feeCents: 150 }] });
    expect(rest.agreementAcceptedAt).not.toBeNull();
    expect(rest.staff[0]).toMatchObject({ role: "OWNER" });
    expect(await verifyPassword("temp-pass-1", rest.staff[0].user.passwordHash)).toBe(true);
  });

  it("refuses to go live without the agreement, and needs a pin for delivery", async () => {
    expect(await createRestaurantByAdmin(adminId, { ...base, agreementSigned: false })).toMatchObject({ ok: false, fieldErrors: { agreementSigned: expect.any(String) } });
    expect(await createRestaurantByAdmin(adminId, { ...base, latitude: undefined, longitude: undefined })).toMatchObject({ ok: false, fieldErrors: { location: expect.any(String) } });
    expect(await createRestaurantByAdmin(adminId, { ...base, commissionRate: "60" })).toMatchObject({ ok: false, fieldErrors: { commissionRate: expect.any(String) } });
    expect(await createRestaurantByAdmin(adminId, { ...base, ownerPassword: "123" })).toMatchObject({ ok: false, fieldErrors: { ownerPassword: expect.any(String) } });
  });

  it("can attach an existing account as owner and create drafts", async () => {
    await prisma.user.create({ data: { email: "rami@beitsaj.test", passwordHash: "x", name: "Rami" } });
    const r = await createRestaurantByAdmin(adminId, { ...base, ownerPassword: undefined, live: false, agreementSigned: false });
    expect(r.ok).toBe(true);
    const rest = await prisma.restaurant.findFirstOrThrow({ where: { displayName: "Beit Saj" } });
    expect(rest).toMatchObject({ status: "DRAFT", orderingEnabled: false });
  });
});

describe("admin: create customer", () => {
  it("creates a customer who can log in, and rejects duplicates", async () => {
    const r = await createCustomerByAdmin(adminId, { name: "Lara", email: "Lara@Test.dev", phone: "03 123 456", password: "welcome-123" });
    expect(r.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "lara@test.dev" }, include: { roles: true } });
    expect(u.phone).toBe("9613123456");
    expect(u.roles.map((x) => x.role)).toEqual(["CUSTOMER"]);
    expect(await createCustomerByAdmin(adminId, { name: "Lara", email: "lara@test.dev", password: "welcome-123" })).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
  });
});

describe("commission per restaurant", () => {
  it("charges each restaurant its own rate, others the default, and 0% when set", async () => {
    await updateSetting("defaultCommissionRateBps", 1200, adminId);
    const a = await makeRestaurant({ name: "A" });
    const b = await makeRestaurant({ name: "B" });
    const c = await makeRestaurant({ name: "C" });
    await setCommissionForRestaurants(adminId, [a.restaurant.id], "15");
    await setCommissionForRestaurants(adminId, [b.restaurant.id], "0");

    const ea = await completedOrderCommission(a, 1);
    const eb = await completedOrderCommission(b, 2);
    const ec = await completedOrderCommission(c, 3);
    expect(ea.rateBps).toBe(1500);
    expect(eb.rateBps).toBe(0);
    expect(eb.commissionCents).toBe(0);
    expect(ec.rateBps).toBe(1200);
    expect(ea.commissionCents).toBe(Math.round(ea.baseCents * 0.15));
    expect(ec.commissionCents).toBe(Math.round(ec.baseCents * 0.12));

    // Back to the default in bulk
    const { changed } = await setCommissionForRestaurants(adminId, [a.restaurant.id, b.restaurant.id, c.restaurant.id], null);
    expect(changed.sort()).toEqual([a.restaurant.id, b.restaurant.id].sort());
    expect(await prisma.restaurant.count({ where: { commissionRateBps: { not: null } } })).toBe(0);
  });
});
