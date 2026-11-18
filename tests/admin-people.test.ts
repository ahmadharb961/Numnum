import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/email", () => ({ sendEmail: async () => true, sendRichEmail: async () => true }));
vi.mock("@/server/push", () => ({ pushInLanguages: async () => 0, pushToRestaurantStaff: async () => 0, pushToUsers: async () => 0 }));

import { prisma } from "@/server/db";
import { adminDeleteAccount, listAccounts, setAccountDisabled, updateAccount } from "@/server/admin-people";
import { createOrder } from "@/server/orders";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

async function makeAdmin() {
  return prisma.user.create({ data: { email: `admin${Date.now()}${Math.random()}@test.dev`, passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } });
}

describe("Admin → Customers: accounts", () => {
  beforeEach(resetDb);

  it("lists what each account is: customer, creator, restaurant, admin, disabled", async () => {
    const customer = await makeCustomer();
    const f = await makeRestaurant({ name: "Owner Grill" });
    const creatorUser = await makeCustomer();
    await prisma.creator.create({ data: { userId: creatorUser.id, handle: "rana.eats", displayName: "Rana", status: "APPROVED", searchName: "rana", searchText: "rana" } });
    const admin = await makeAdmin();
    const off = await makeCustomer();
    await prisma.user.update({ where: { id: off.id }, data: { disabled: true } });

    const ids = async (k?: Parameters<typeof listAccounts>[1], q?: string) => (await listAccounts(q, k)).list.map((u) => u.id).sort();
    expect(await ids("customer")).toEqual([customer.id, off.id].sort());
    expect(await ids("creator")).toEqual([creatorUser.id]);
    expect(await ids("restaurant")).toEqual([f.user.id]);
    expect(await ids("admin")).toEqual([admin.id]);
    expect(await ids("disabled")).toEqual([off.id]);
    const all = await listAccounts(undefined, undefined);
    expect(all.total).toBe(5);
    expect(all.counts).toMatchObject({ customer: 2, creator: 1, restaurant: 1, admin: 1, disabled: 1 });
    expect(await ids(undefined, "@rana")).toEqual([creatorUser.id]); // search by creator username
    const row = all.list.find((u) => u.id === f.user.id)!;
    expect(row.staff[0]).toMatchObject({ role: "OWNER", restaurant: { displayName: "Owner Grill" } });
  });

  it("edit checks the phone; disabling logs them out; admins and yourself are protected", async () => {
    const admin = await makeAdmin();
    const u = await makeCustomer();
    await expect(updateAccount(admin.id, u.id, { name: "Rana Haddad", phone: "01 234 567" })).rejects.toThrow(); // a landline
    await updateAccount(admin.id, u.id, { name: "  Rana   Haddad ", phone: "71 234 567" });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ name: "Rana Haddad", phone: "96171234567" });

    await prisma.session.create({ data: { userId: u.id, tokenHash: `t${Date.now()}`, expiresAt: new Date(Date.now() + 86400_000) } });
    await setAccountDisabled(admin.id, u.id, true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).disabled).toBe(true);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    await setAccountDisabled(admin.id, u.id, false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).disabled).toBe(false);

    const other = await makeAdmin();
    await expect(setAccountDisabled(admin.id, other.id, true)).rejects.toThrow(/Admin/);
    await expect(setAccountDisabled(admin.id, admin.id, true)).rejects.toThrow(/own account/);
    expect(await prisma.auditLog.count({ where: { entityId: u.id, action: { in: ["user.admin_edit", "user.disable", "user.enable"] } } })).toBe(3);
  });

  it("delete: refused for a restaurant owner; a customer's orders stay without their details; a creator's reels go", async () => {
    const admin = await makeAdmin();
    const f = await makeRestaurant();
    await expect(adminDeleteAccount(admin.id, f.user.id)).rejects.toThrow(/own/);

    const u = await makeCustomer();
    const placed = await createOrder(orderPayload(f, "admin-people-order-xxxxxxxx"), { deviceKey: "dev-people-aaaaaaaaaaaa", ipHash: null, userId: u.id });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: placed.reference } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    await adminDeleteAccount(admin.id, u.id);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ userId: null, customerName: "Deleted customer", customerPhone: "" });
    expect(await prisma.auditLog.count({ where: { entityId: u.id, action: "user.admin_delete", actorId: admin.id } })).toBe(1);

    const cu = await makeCustomer();
    const c = await prisma.creator.create({ data: { userId: cu.id, handle: "gone.eats", displayName: "Gone", status: "APPROVED", searchName: "gone", searchText: "gone" } });
    const video = await prisma.mediaAsset.create({ data: { restaurantId: null, kind: "VIDEO", storageKey: "video/x.mp4", url: "", mimeType: "video/mp4", sizeBytes: 1, uploadedById: cu.id } });
    const reel = await prisma.reel.create({ data: { restaurantId: f.restaurant.id, menuItemId: f.burger.id, videoAssetId: video.id, creatorId: c.id, tagStatus: "ACCEPTED", status: "READY", visibility: "PUBLISHED" } });
    await adminDeleteAccount(admin.id, cu.id);
    expect(await prisma.reel.findUnique({ where: { id: reel.id } })).toBeNull();
    await expect(adminDeleteAccount(admin.id, admin.id)).rejects.toThrow(/own account/);
  });
});
