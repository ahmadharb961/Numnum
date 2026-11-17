import { beforeEach, describe, expect, it, vi } from "vitest";

const emails = vi.hoisted(() => [] as { to: string; subject: string; html: string; text: string }[]);
vi.mock("@/server/email", () => ({
  sendEmail: async () => true,
  sendRichEmail: async (to: string, subject: string, html: string, text: string) => {
    emails.push({ to, subject, html, text });
    return true;
  },
}));

import { prisma } from "@/server/db";
import { confirmEmail, sendRestaurantWelcome, sendVerifyEmail, verifyToken, welcomeEmail } from "@/server/restaurant-emails";
import { updateSetting, DEFAULT_SETTINGS } from "@/server/settings";
import { makeRestaurant, resetDb } from "./helpers";

const data = { ownerName: "Karim Haddad", restaurantName: "Burger House", ratePct: "8%", dueDays: 10, graceDays: 7, whishName: "numnum SAL", whishNumber: "96170123456", loginEmail: "karim@burger.lb" };

describe("welcome email content", () => {
  it("covers commission, onboarding, the app + notifications, Whish payment and insights", () => {
    const m = welcomeEmail(data, "en");
    expect(m.subject).toBe("Welcome to numnum, Burger House 🎉");
    for (const s of ["Welcome to numnum, Karim!", "8%", "only on completed orders", "Nothing on delivery fees", "you keep your own drivers", "Go live in 3 steps", "Add your menu and photos", "Upload your first reel", "/dashboard", "turn on notifications", "On the 1st of each month", "within 10 days", "numnum SAL", "+961 70 123 456", "don't be late", "after 7 more days", "Insights"])
      expect(m.html).toContain(s);
    expect(m.text).toContain("Open my dashboard");
  });

  it("is in Arabic, right-to-left, for an Arabic-speaking owner, numbers kept readable", () => {
    const m = welcomeEmail(data, "ar");
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain("عمولتك");
    expect(m.html).toMatch(/<span dir="ltr"[^>]*>\+961 70 123 456<\/span>/);
  });

  it("without a Whish number in settings, points to the invoices", () => {
    expect(welcomeEmail({ ...data, whishNumber: "" }, "en").html).toContain("the details are on every invoice in your dashboard");
  });

  it("with the store apps set, sends restaurants to the app (not 'add to home screen')", () => {
    const links = { ios: "https://apps.apple.com/app/numnum/id123", android: "https://play.google.com/store/apps/details?id=me.numnum.app" };
    const m = welcomeEmail({ ...data, appLinks: links }, "en");
    expect(m.html).toContain("Get the numnum app and turn on notifications");
    expect(m.html).toContain(`href="${links.ios}"`);
    expect(m.html).toContain(`href="${links.android.replace(/&/g, "&amp;")}"`);
    expect(m.html).toContain(">App Store<");
    expect(m.html).toContain(">Google Play<");
    expect(m.html).not.toContain("home screen");
    expect(m.text).toContain(`Google Play: ${links.android}`);
    expect(m.text).not.toContain("home screen");
    const ar = welcomeEmail({ ...data, appLinks: links }, "ar");
    expect(ar.html).toContain("حمّل تطبيق numnum وفعّل الإشعارات");
  });

  it("only one store set: just that button", () => {
    const m = welcomeEmail({ ...data, appLinks: { ios: "", android: "https://play.google.com/store/apps/details?id=me.numnum.app" } }, "en");
    expect(m.html).toContain(">Google Play<");
    expect(m.html).not.toContain(">App Store<");
  });

  it("before the app is in the stores, explains adding the dashboard to the home screen", () => {
    for (const appLinks of [undefined, { ios: "", android: "" }]) {
      const m = welcomeEmail({ ...data, appLinks }, "en");
      expect(m.html).toContain("add it to the home screen");
      expect(m.html).not.toContain(">App Store<");
    }
  });

  it("escapes names typed by restaurants", () => {
    expect(welcomeEmail({ ...data, restaurantName: "<script>x</script>" }, "en").html).not.toContain("<script>");
  });
});

describe("email confirmation → welcome email", () => {
  beforeEach(async () => {
    await resetDb();
    emails.length = 0;
  });

  it("sends the confirmation link, then the welcome email once, with the restaurant's own rate", async () => {
    const f = await makeRestaurant({ rateBps: 1000 });
    await prisma.user.update({ where: { id: f.user.id }, data: { emailVerifiedAt: null } });
    await updateSetting("whish", { ...DEFAULT_SETTINGS.whish, recipientName: "numnum SAL", whishNumber: "96170123456" }, f.user.id);

    expect(await sendVerifyEmail(f.user.id)).toBe(true);
    expect(emails[0]).toMatchObject({ to: f.user.email, subject: "Confirm your email to start on numnum" });
    const token = decodeURIComponent(emails[0].text.match(/token=([^\s]+)/)![1]);

    const r = await confirmEmail(token);
    expect(r).toEqual({ ok: true, userId: f.user.id, already: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).emailVerifiedAt).not.toBeNull();
    expect(emails).toHaveLength(2);
    expect(emails[1].subject).toMatch(/^Welcome to numnum/);
    expect(emails[1].html).toContain("10%"); // restaurant-specific commission
    expect(emails[1].html).toContain("+961 70 123 456");

    // opening the link again: no second welcome email
    expect(await confirmEmail(token)).toEqual({ ok: true, userId: f.user.id, already: true });
    expect(emails).toHaveLength(2);
    // nothing to confirm any more
    expect(await sendVerifyEmail(f.user.id)).toBe(false);
  });

  it("refuses tampered and expired links", async () => {
    const f = await makeRestaurant();
    await prisma.user.update({ where: { id: f.user.id }, data: { emailVerifiedAt: null } });
    const good = verifyToken(f.user.id, f.user.email);
    expect(await confirmEmail(good.slice(0, -2) + "00")).toEqual({ ok: false, reason: "invalid" });
    expect(await confirmEmail("garbage")).toEqual({ ok: false, reason: "invalid" });
    expect(await confirmEmail(verifyToken(f.user.id, "other@test.dev"))).toEqual({ ok: false, reason: "invalid" });
    expect(await confirmEmail(verifyToken(f.user.id, f.user.email, Date.now() - 1000))).toEqual({ ok: false, reason: "expired" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).emailVerifiedAt).toBeNull();
    expect(emails).toHaveLength(0);
  });

  it("uses the platform default rate when the restaurant has none", async () => {
    const f = await makeRestaurant({ rateBps: null });
    expect(await sendRestaurantWelcome(f.restaurant.id)).toBe(true);
    expect(emails[0].html).toContain(`${DEFAULT_SETTINGS.defaultCommissionRateBps / 100}%`);
  });
});
