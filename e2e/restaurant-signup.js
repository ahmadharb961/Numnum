// Restaurant sign-up → "confirm your email" reminder → confirmation link → confirmed.
// (The welcome email's content and sending are covered by tests/restaurant-emails.test.ts.)
//   BASE_URL=http://localhost:3000 node e2e/restaurant-signup.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || require("os").tmpdir();
const db = new PrismaClient();
let fails = 0;
const check = (c, m, x) => {
  console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — " + JSON.stringify(x)}`);
  if (!c) fails++;
};
// Same signed link the server emails (SESSION_SECRET from the environment or .env).
function secret() {
  let s = process.env.SESSION_SECRET;
  if (!s) {
    const m = fs.readFileSync(path.join(__dirname, "../.env"), "utf8").match(/^SESSION_SECRET="?([^"\n]*)"?/m);
    s = m && m[1];
  }
  return s && s.length >= 16 ? s : "dev-insecure-secret-do-not-use";
}
const token = (id, email, exp = Date.now() + 7 * 86400000) => `${id}.${exp.toString(36)}.${crypto.createHmac("sha256", secret()).update(`verify:${id}:${email.toLowerCase()}:${exp}`).digest("hex").slice(0, 32)}`;

(async () => {
  const email = `newresto${Date.now()}@test.lb`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const p = await ctx.newPage();
  await p.goto("/business/register", { waitUntil: "networkidle" });
  await p.fill("#displayName", "Zaatar House");
  await p.fill("#businessName", "Zaatar House SARL");
  await p.fill("#ownerName", "Nour Khalil");
  await p.fill("#email", email);
  await p.fill("#phone", "70 555 123");
  await p.fill("#password", "zaatarpass1");
  await p.check('input[name="terms"]');
  await Promise.all([p.waitForURL(/\/dashboard/, { timeout: 20000 }), p.getByRole("button", { name: /Create restaurant account/ }).click()]);
  const user = await db.user.findUnique({ where: { email } });
  check(!!user && user.emailVerifiedAt === null, "new restaurant account created, email not confirmed yet");

  await p.goto("/dashboard", { waitUntil: "networkidle" });
  const banner = p.getByTestId("verify-email-banner");
  check(await banner.isVisible().catch(() => false), "dashboard shows the 'Confirm your email' reminder");
  check((await banner.innerText().catch(() => "")).includes(email), "reminder shows the email address");
  await p.screenshot({ path: `${SHOTS}/signup-banner.png` });

  // a broken link
  await p.goto(`/verify-email?token=${encodeURIComponent(token(user.id, email).slice(0, -3) + "zzz")}`, { waitUntil: "networkidle" });
  check((await p.getByText("This link isn't valid").count()) > 0, "a tampered link is refused with a clear message");

  // the real link from the email
  await p.goto(`/verify-email?token=${encodeURIComponent(token(user.id, email))}`, { waitUntil: "networkidle" });
  check((await p.getByText("Email confirmed!").count()) > 0, "confirmation link → 'Email confirmed!'");
  await p.screenshot({ path: `${SHOTS}/signup-confirmed.png` });
  check(!!(await db.user.findUnique({ where: { email } })).emailVerifiedAt, "email marked confirmed");
  await p.getByRole("link", { name: "Open my dashboard" }).click();
  await p.waitForURL(/\/dashboard/);
  await p.waitForLoadState("networkidle");
  check(!(await p.getByTestId("verify-email-banner").count()), "the reminder is gone");

  // cleanup
  const r = await db.restaurant.findFirst({ where: { email } });
  if (r) await db.restaurant.delete({ where: { id: r.id } }).catch(() => {});
  await db.user.delete({ where: { email } }).catch(() => {});
  await b.close();
  await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
