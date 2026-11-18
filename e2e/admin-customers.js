// Admin → Customers: what each account is (customer, creator, restaurant, admin), filters, a profile
// page, edit, password reset email, disable/enable (they really can't log in), and delete.
//   BASE_URL=http://localhost:3000 node e2e/admin-customers.js
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
let ip = 80;

(async () => {
  const db = new PrismaClient();
  const b = await chromium.launch();
  const errors = [];
  async function login(email, password) {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.1.${ip++}` } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email}: ${String(e).slice(0, 160)}`));
    p.on("dialog", (d) => d.accept());
    await p.goto("/login");
    await p.fill("#email", email);
    await p.fill("#password", password);
    await p.locator("form button[type=submit]").click();
    const ok = await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).then(() => true, () => false);
    return { p, ok };
  }
  const ADMIN = [process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234"];
  // A test customer to edit, disable and delete.
  const tmpEmail = `admin-e2e-${Date.now()}@numnum.test`;
  // Same password as the demo customer (demo1234), copied from its account.
  const demoHash = (await db.user.findUniqueOrThrow({ where: { email: "customer@numnum.demo" } })).passwordHash;
  const tmp = await db.user.create({ data: { email: tmpEmail, name: "Temp Person", passwordHash: demoHash, roles: { create: { role: "CUSTOMER" } } } });
  const tmpPassword = "demo1234";

  const { p: a } = await login(...ADMIN);
  console.log("\nThe list says what each account is");
  await a.goto("/admin/customers", { waitUntil: "load" }); await settle(a);
  const rowOf = (text) => a.locator("[data-testid=account-row]").filter({ hasText: text }).first();
  check((await rowOf("mrfoodies@numnum.demo").innerText()).includes("Food creator · @mr.foodies"), "Mr. Foodies: 'Food creator · @mr.foodies'");
  check((await rowOf("owner@burgerhouse.demo").innerText()).includes("Owner · Burger House"), "Burger House's owner: 'Owner · Burger House'");
  check((await rowOf(ADMIN[0]).innerText()).includes("Admin"), "the admin: 'Admin'");
  check((await rowOf("customer@numnum.demo").innerText()).includes("Customer"), "a customer: 'Customer'");
  await a.getByTestId("filter-creator").click();
  await a.waitForURL(/type=creator/); await settle(a);
  const creators = await a.locator("[data-testid=account-row]").allInnerTexts();
  check(creators.length >= 1 && creators.every((r) => r.includes("creator")), "filter: Food creators only", creators.length);
  await a.getByTestId("filter-restaurant").click();
  await a.waitForURL(/type=restaurant/); await settle(a);
  const rest = await a.locator("[data-testid=account-row]").allInnerTexts();
  check(rest.length >= 6 && rest.every((r) => /Owner|Manager|Staff/.test(r)), "filter: Restaurants only", rest.length);
  await a.goto(`/admin/customers?q=${encodeURIComponent("@mr.foodies")}`, { waitUntil: "load" }); await settle(a);
  check((await a.locator("[data-testid=account-row]").count()) === 1, "search by @username");

  console.log("\nA profile");
  await a.locator("[data-testid=account-link]").first().click();
  await a.waitForURL(/\/admin\/customers\/[a-z0-9]+$/); await settle(a);
  const prof = await a.getByTestId("account-profile").innerText();
  check(prof.includes("mrfoodies@numnum.demo") && prof.includes("Joined") && prof.includes("Follows"), "shows their details and activity");
  check((await a.getByTestId("account-creator").innerText()).includes("@mr.foodies"), "and their creator profile");
  check((await a.getByTestId("account-delete-blocked").count()) === 0 && (await a.getByTestId("account-delete").count()) === 1, "a creator can be deleted (with confirmation)");

  console.log("\nEdit, reset, disable, delete (a test customer)");
  await a.goto(`/admin/customers/${tmp.id}`, { waitUntil: "load" }); await settle(a);
  await a.fill("#a-name", "Temp Person Edited");
  await a.fill("#a-phone", "71 222 333");
  await a.getByTestId("account-save").click();
  await a.getByTestId("account-actions").getByText("Saved", { exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
  const edited = await db.user.findUniqueOrThrow({ where: { id: tmp.id } });
  check(edited.name === "Temp Person Edited" && edited.phone === "96171222333", "edit name and mobile", { name: edited.name, phone: edited.phone });
  await a.fill("#a-phone", "01 234 567");
  await a.getByTestId("account-save").click();
  check(await a.getByText(/mobile/i).first().waitFor({ timeout: 8000 }).then(() => true, () => false), "a landline is refused with a message");
  await a.fill("#a-phone", "71 222 333");
  await a.getByTestId("account-reset").click();
  check(await a.getByText(`Password reset link sent to ${tmpEmail}`).waitFor({ timeout: 10000 }).then(() => true, () => false), "email a password reset link");
  await a.getByTestId("account-disable").click();
  await a.getByText("Account disabled").waitFor({ timeout: 10000 });
  check((await db.user.findUniqueOrThrow({ where: { id: tmp.id } })).disabled, "disable login");
  const blocked = await login(tmpEmail, tmpPassword);
  check(!blocked.ok, "a disabled account really can't log in");
  await blocked.p.context().close();
  await a.goto("/admin/customers?type=disabled", { waitUntil: "load" }); await settle(a);
  check((await rowOf(tmpEmail).innerText()).includes("Disabled"), "shown as Disabled in the list");
  await a.goto(`/admin/customers/${tmp.id}`, { waitUntil: "load" }); await settle(a);
  await a.getByTestId("account-disable").click();
  await a.getByText("Account enabled").waitFor({ timeout: 10000 });
  const back = await login(tmpEmail, tmpPassword);
  check(back.ok, "enabled again: they can log in");
  await back.p.context().close();
  await a.goto(`/admin/customers/${tmp.id}`, { waitUntil: "load" }); await settle(a);
  await a.getByTestId("account-delete").click();
  await a.waitForURL(/\/admin\/customers$/, { timeout: 15000 });
  check(!(await db.user.findUnique({ where: { id: tmp.id } })), "delete (after confirming) removes the account and returns to the list");

  console.log("\nProtected accounts");
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" } });
  await a.goto(`/admin/customers/${owner.id}`, { waitUntil: "load" }); await settle(a);
  check((await a.getByTestId("account-delete-blocked").innerText()).includes("Burger House") && (await a.getByTestId("account-delete").count()) === 0, "a restaurant owner can't be deleted from here (it says why)");
  const me = await db.user.findUniqueOrThrow({ where: { email: ADMIN[0] } });
  await a.goto(`/admin/customers/${me.id}`, { waitUntil: "load" }); await settle(a);
  check((await a.getByTestId("account-disable").count()) === 0 && (await a.getByTestId("account-delete").count()) === 0, "your own (admin) account can't be disabled or deleted");

  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
