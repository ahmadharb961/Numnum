// Forgot password → email link → new password → log in; change password from Account; the
// restaurant dashboard links to it; Arabic.
//   BASE_URL=http://localhost:3000 node e2e/password.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { createHmac } = require("node:crypto");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const secret = () => (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : "dev-insecure-secret-do-not-use");
/** The link the reset email carries (no mail server here): same signature as the server's. */
const resetLink = (u, exp = Date.now() + 3600_000) => `/reset-password?token=${encodeURIComponent(`${u.id}.${exp.toString(36)}.${createHmac("sha256", secret()).update(`reset:${u.id}:${u.passwordHash}:${exp}`).digest("hex").slice(0, 32)}`)}`;
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});

(async () => {
  const db = new PrismaClient();
  const email = "pw-test@numnum.test";
  await db.user.deleteMany({ where: { email } });
  let u = await db.user.create({ data: { email, name: "Rana Test", passwordHash: await bcrypt.hash("first-password", 11), roles: { create: { role: "CUSTOMER" } } } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.7.7.7" } });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  const login = async (pw) => {
    await p.goto("/login", { waitUntil: "load" }); await settle(p);
    await p.fill("#email", email); await p.fill("#password", pw);
    await p.locator('form:has(#password) button[type=submit]').click();
    return p.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 8000 }).then(() => true, () => false);
  };

  console.log("\nForgot password");
  await p.goto("/login", { waitUntil: "load" }); await settle(p);
  await p.getByTestId("forgot-link").click();
  await p.waitForURL(/\/forgot-password/);
  await p.fill("#email", email);
  await p.getByRole("button", { name: "Send me a link" }).click();
  await p.getByTestId("forgot-sent").waitFor();
  check(/we've sent it a link/.test(await p.getByTestId("forgot-sent").innerText()), "login → Forgot password? → email → 'we've sent a link'");
  // An unknown email gets the very same answer (no way to probe which emails have accounts)
  await p.goto("/forgot-password", { waitUntil: "load" }); await settle(p);
  await p.fill("#email", "nobody-here@numnum.test");
  await p.getByRole("button", { name: "Send me a link" }).click();
  await p.getByTestId("forgot-sent").waitFor();
  check(true, "an unknown email gets the same answer");

  console.log("\nReset from the email link");
  await p.goto(resetLink(u), { waitUntil: "load" }); await settle(p);
  await p.fill("#password", "new-password-1"); await p.fill("#confirm", "different-1");
  await p.getByRole("button", { name: "Save new password" }).click();
  await p.getByText("The two passwords don't match").waitFor();
  check(true, "mismatched passwords are caught");
  await p.fill("#password", "new-password-1"); await p.fill("#confirm", "new-password-1");
  await p.getByRole("button", { name: "Save new password" }).click();
  await p.waitForURL(/\/login\?reset=1/);
  check(/Password changed/.test(await p.locator("form").first().innerText()), "saved → back to log in with 'Password changed'");
  check(!(await login("first-password")), "the old password no longer works");
  check(await login("new-password-1"), "the new password logs in");
  await p.goto(resetLink(u), { waitUntil: "load" }); await settle(p);
  check(await p.getByTestId("reset-invalid").isVisible(), "the same link can't be used twice");
  u = await db.user.findUnique({ where: { id: u.id } }); // the link is signed with the current password
  await p.goto(resetLink(u, Date.now() - 1000), { waitUntil: "load" }); await settle(p);
  check(/expired/.test(await p.getByTestId("reset-invalid").innerText()), "an expired link says so, with 'Send a new link'");

  console.log("\nChange password (Account)");
  await p.goto("/account", { waitUntil: "load" }); await settle(p);
  await p.locator("a[href='/account/password']:visible").click();
  await p.waitForURL(/\/account\/password/); await settle(p);
  await p.fill("#current", "wrong-one"); await p.fill("#password", "third-password"); await p.fill("#confirm", "third-password");
  await p.getByRole("button", { name: "Change password" }).click();
  await p.getByText("Your current password isn't right").waitFor();
  check(true, "a wrong current password is refused");
  await p.fill("#current", "new-password-1"); await p.fill("#password", "third-password"); await p.fill("#confirm", "third-password");
  await p.getByRole("button", { name: "Change password" }).click();
  await p.getByText("Password changed. Other devices were logged out.").waitFor();
  await p.goto("/account", { waitUntil: "load" });
  check(new URL(p.url()).pathname === "/account", "still logged in on this device after changing it");
  u = await db.user.findUnique({ where: { id: u.id } });
  check(await bcrypt.compare("third-password", u.passwordHash), "the new password is saved");

  console.log("\nRestaurant dashboard and Arabic");
  const owner = await db.user.findUnique({ where: { email: "owner@burgerhouse.demo" } });
  check(!!owner, "demo restaurant owner exists");
  if (owner) {
    const ctx2 = await b.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.7.7.8" } });
    const d = await ctx2.newPage();
    await d.goto("/login"); await d.fill("#email", "owner@burgerhouse.demo"); await d.fill("#password", "demo1234");
    await Promise.all([d.waitForURL((x) => !x.pathname.startsWith("/login")), d.locator('form:has(#password) button[type=submit]').click()]);
    await d.goto("/dashboard/settings", { waitUntil: "load" }); await settle(d);
    check(await d.getByTestId("change-password-link").isVisible(), "dashboard Settings has 'Change password'");
    await ctx2.close();
  }
  await ctx.addCookies([{ name: "nn_lang", value: "ar", url: BASE }]);
  await p.goto("/forgot-password", { waitUntil: "load" }); await settle(p);
  check((await p.locator("h1").first().innerText()).includes("نسيت كلمة المرور"), "in Arabic", await p.locator("h1").first().innerText());
  check(!errors.length, "no page errors", errors);

  await db.user.deleteMany({ where: { email } });
  await b.close(); await db.$disconnect();
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
