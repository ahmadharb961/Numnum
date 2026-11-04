import { beforeEach, describe, expect, it, vi } from "vitest";

const emails = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/server/email", () => ({
  sendEmail: async () => true,
  sendRichEmail: async (to: string, subject: string) => {
    emails.push({ to, subject });
    return true;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/server/request", () => ({ ipHash: async () => null, clientIp: async () => null }));
const adminUser = vi.hoisted(() => ({ id: "", email: "admin@test.dev", name: "Admin", phone: null, roles: ["ADMIN"] }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), requireAdmin: async () => adminUser }));

import { prisma } from "@/server/db";
import { changeLoginEmailAction } from "@/actions/admin";
import { makeCustomer, makeRestaurant, resetDb } from "./helpers";

describe("admin: change a login email", () => {
  beforeEach(async () => {
    await resetDb();
    emails.length = 0;
    adminUser.id = (await prisma.user.create({ data: { email: "admin@test.dev", passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } })).id;
  });

  it("fixes a restaurant owner's typo and sends the confirmation to the new address", async () => {
    const { user: owner } = await makeRestaurant();
    await prisma.user.update({ where: { id: owner.id }, data: { email: "karim@gmial.com", emailVerifiedAt: null } });
    const r = await changeLoginEmailAction(owner.id, "  Karim@Gmail.com ");
    expect(r.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(u.email).toBe("karim@gmail.com");
    expect(u.emailVerifiedAt).toBeNull();
    expect(emails.map((e) => e.to)).toEqual(["karim@gmail.com"]);
    expect(await prisma.auditLog.count({ where: { action: "user.email_change" } })).toBe(1);
  });

  it("a confirmed owner must confirm the new address again", async () => {
    const { user: owner } = await makeRestaurant();
    await prisma.user.update({ where: { id: owner.id }, data: { emailVerifiedAt: new Date() } });
    await changeLoginEmailAction(owner.id, "new@burger.lb");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerifiedAt).toBeNull();
    expect(emails[0]?.to).toBe("new@burger.lb");
  });

  it("customers don't need confirmation: no email is sent", async () => {
    const c = await makeCustomer();
    expect((await changeLoginEmailAction(c.id, "rana@gmail.com")).ok).toBe(true);
    expect(emails).toHaveLength(0);
  });

  it("refuses an invalid email or one another account uses", async () => {
    const { user: owner } = await makeRestaurant();
    const other = await makeCustomer();
    expect(await changeLoginEmailAction(owner.id, "not-an-email")).toMatchObject({ ok: false, error: "Enter a valid email" });
    expect(await changeLoginEmailAction(owner.id, other.email)).toMatchObject({ ok: false, error: "Another account already uses this email" });
    expect(emails).toHaveLength(0);
  });
});
