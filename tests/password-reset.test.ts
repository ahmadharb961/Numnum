import { beforeEach, describe, expect, it, vi } from "vitest";

const emails = vi.hoisted(() => [] as { to: string; subject: string; html: string; text: string }[]);
vi.mock("@/server/email", () => ({
  sendEmail: async (to: string, subject: string, text: string) => {
    emails.push({ to, subject, html: "", text });
    return true;
  },
  sendRichEmail: async (to: string, subject: string, html: string, text: string) => {
    emails.push({ to, subject, html, text });
    return true;
  },
}));

import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/passwords";
import { changePassword, checkResetToken, resetPassword, resetToken, sendPasswordReset } from "@/server/password-reset";
import { createOrder, restaurantOrderAction } from "@/server/orders";
import { updateSetting, DEFAULT_SETTINGS } from "@/server/settings";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

async function userWithPassword(pw = "old-password-1", locale: string | null = null) {
  const c = await makeCustomer();
  return prisma.user.update({ where: { id: c.id }, data: { passwordHash: await hashPassword(pw), locale } });
}
const tokenFrom = (text: string) => decodeURIComponent(/reset-password\?token=([^\s"&]+)/.exec(text)![1]);

describe("forgot / reset password", () => {
  beforeEach(async () => {
    await resetDb();
    emails.length = 0;
  });

  it("emails a reset link to an existing account, and nothing for an unknown email", async () => {
    const u = await userWithPassword();
    await sendPasswordReset(u.email.toUpperCase());
    await sendPasswordReset("nobody@nowhere.dev");
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(u.email);
    expect(emails[0].subject).toBe("Reset your numnum password");
    expect(emails[0].html).toContain("Choose a new password");
    expect((await checkResetToken(tokenFrom(emails[0].text))).ok).toBe(true);
  });

  it("sends it in Arabic to an Arabic-speaking account", async () => {
    const u = await userWithPassword("old-password-1", "ar");
    await sendPasswordReset(u.email);
    expect(emails[0].subject).toBe("إعادة تعيين كلمة مرور numnum");
    expect(emails[0].html).toContain('dir="rtl"');
  });

  it("sets the new password, signs out everywhere, and the link works only once", async () => {
    const u = await userWithPassword();
    await prisma.session.create({ data: { tokenHash: "s1", userId: u.id, expiresAt: new Date(Date.now() + 86400_000) } });
    const token = resetToken(u);
    expect(await resetPassword(token, "short")).toEqual({ ok: false, error: "Password must be at least 8 characters" });
    expect(await resetPassword(token, "brand-new-pass")).toEqual({ ok: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifyPassword("brand-new-pass", after.passwordHash)).toBe(true);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await resetPassword(token, "another-pass-2")).ok).toBe(false); // used: the password changed
  });

  it("rejects expired, tampered and disabled-account links", async () => {
    const u = await userWithPassword();
    expect(await checkResetToken(resetToken(u, Date.now() - 1000))).toEqual({ ok: false, reason: "expired" });
    const good = resetToken(u);
    expect(await checkResetToken(good.slice(0, -1) + (good.endsWith("a") ? "b" : "a"))).toEqual({ ok: false, reason: "invalid" });
    expect(await checkResetToken("garbage")).toEqual({ ok: false, reason: "invalid" });
    await prisma.user.update({ where: { id: u.id }, data: { disabled: true } });
    expect(await checkResetToken(good)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("change password", () => {
  beforeEach(resetDb);

  it("needs the current password, keeps this device signed in, signs out the others", async () => {
    const u = await userWithPassword();
    for (const h of ["this-device", "other-device"]) await prisma.session.create({ data: { tokenHash: h, userId: u.id, expiresAt: new Date(Date.now() + 86400_000) } });
    expect(await changePassword(u.id, "wrong", "brand-new-pass", "this-device")).toMatchObject({ ok: false, field: "current" });
    expect(await changePassword(u.id, "old-password-1", "old-password-1", "this-device")).toMatchObject({ ok: false, field: "password" });
    expect(await changePassword(u.id, "old-password-1", "brand-new-pass", "this-device")).toEqual({ ok: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifyPassword("brand-new-pass", after.passwordHash)).toBe(true);
    expect((await prisma.session.findMany({ where: { userId: u.id } })).map((s) => s.tokenHash)).toEqual(["this-device"]);
  });
});

describe("order emails point to the apps once they're in the stores", () => {
  beforeEach(async () => {
    await resetDb();
    emails.length = 0;
  });

  const flush = () => new Promise((r) => setTimeout(r, 200));

  it("restaurant: 'open the numnum app'; customer: app store links. Without links: the old wording", async () => {
    for (const live of [false, true]) {
      emails.length = 0;
      await updateSetting("appLinks", live ? { ios: "https://apps.apple.com/app/id123", android: "https://play.google.com/store/apps/details?id=me.numnum" } : DEFAULT_SETTINGS.appLinks, null);
      const f = await makeRestaurant();
      const c = await makeCustomer();
      const o = await createOrder(orderPayload(f, `k-${live}-${Date.now()}`), { deviceKey: "dev-pw-aaaaaaaaaaaaaaaa", ipHash: null, userId: c.id });
      await flush();
      const toRestaurant = emails.find((e) => e.to === f.user.email)!;
      expect(toRestaurant.text).toContain(live ? "Open the numnum app to accept it." : "Accept it in your dashboard:");
      const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
      await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT", { etaMinutes: 20 });
      await flush();
      const toCustomer = emails.find((e) => e.to === c.email)!;
      expect(toCustomer.text.includes("App Store: https://apps.apple.com/app/id123")).toBe(live);
      expect(toCustomer.text.includes("Google Play:")).toBe(live);
      expect(toCustomer.text).toContain(`/order/${o.reference}`);
    }
  });
});
