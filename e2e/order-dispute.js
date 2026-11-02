// A restaurant marks an accepted order "not delivered" → the customer is asked → says they received
// it → commission applies, and the admin sees it under "Customer disagrees".
//   BASE_URL=http://localhost:3000 node e2e/order-dispute.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || require("os").tmpdir();
const db = new PrismaClient();
let fails = 0;
const check = (c, m, x) => {
  console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — " + JSON.stringify(x)}`);
  if (!c) fails++;
};
async function login(ctx, email, pw) {
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), p.getByRole("button", { name: "Log in" }).click()]);
  return p;
}
async function closeRatingPopup(p) {
  const d = p.getByRole("dialog", { name: "How was your order?" });
  if (await d.waitFor({ timeout: 2500 }).then(() => true, () => false)) await d.getByRole("button", { name: /Close|Not now/ }).first().click().catch(() => {});
}

(async () => {
  const b = await chromium.launch();
  // 1. The customer orders (saved address) and the restaurant accepts
  const cctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, geolocation: { latitude: 33.8975, longitude: 35.4815 }, permissions: ["geolocation"] });
  const c = await login(cctx, "customer@numnum.demo", "demo1234");
  await c.goto("/r/burger-house", { waitUntil: "networkidle" });
  await closeRatingPopup(c);
  await c.getByLabel("Add Loaded Fries").first().click();
  await c.getByRole("button", { name: /Add to cart/ }).click();
  await c.waitForTimeout(500);
  await c.goto("/checkout", { waitUntil: "networkidle" });
  await c.getByRole("button", { name: /^Delivery/ }).first().click();
  await c.getByRole("button", { name: "Continue" }).click();
  await c.waitForTimeout(800);
  await c.getByRole("button", { name: "Review order" }).click();
  await Promise.all([c.waitForURL(/\/order\//, { timeout: 20000 }), c.getByRole("button", { name: /Place order/ }).click()]);
  const ref = c.url().match(/\/order\/([^?]+)/)[1];
  check(!!ref, `order ${ref} placed`);

  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" } });
  await db.user.update({ where: { id: owner.id }, data: { locale: "en" } });
  const rctx = await b.newContext({ ...devices["Pixel 7"], baseURL: BASE });
  const r = await login(rctx, "owner@burgerhouse.demo", "demo1234");
  await r.goto(`/dashboard/orders?ref=${ref}`, { waitUntil: "networkidle" });
  await r.getByRole("button", { name: /Accept · \d+ min/ }).first().click();
  await r.waitForTimeout(1500);

  // 2. The restaurant marks it not delivered: it is warned that the customer will be asked
  await r.reload({ waitUntil: "networkidle" });
  await r.getByRole("button", { name: /^Canceled \/ not delivered$/ }).first().click();
  const warn = r.getByTestId("verdict-warning");
  check(await warn.isVisible().catch(() => false), "restaurant is warned the customer will be asked to confirm");
  await r.screenshot({ path: `${SHOTS}/dispute-restaurant-warning.png` });
  await r.getByRole("button", { name: "Customer canceled by phone" }).click();
  await r.getByRole("button", { name: "Mark as not delivered" }).click();
  await r.waitForTimeout(1500);
  const o1 = await db.order.findUniqueOrThrow({ where: { reference: ref } });
  check(o1.status === "FAILED", "order marked not delivered", o1.status);
  check((await db.commissionEvent.count({ where: { orderId: o1.id } })) === 0, "no commission yet");

  // 3. The customer is asked and says they received the food
  await c.goto(`/order/${ref}`, { waitUntil: "networkidle" });
  const box = c.getByTestId("verdict-box");
  check(await box.isVisible().catch(() => false), "customer sees 'Burger House marked this order as not delivered. Is that right?'");
  await c.screenshot({ path: `${SHOTS}/dispute-customer-question.png`, fullPage: true });
  await box.getByRole("button", { name: "No, I received the food" }).click();
  await c.getByTestId("verdict-done").waitFor({ timeout: 10000 });
  check((await c.getByTestId("verdict-done").innerText()).includes("Our team has been notified"), "customer sees the thank-you message");
  const o2 = await db.order.findUniqueOrThrow({ where: { reference: ref }, include: { commission: true } });
  check(o2.customerVerdict === "RECEIVED" && o2.commission?.billableEvent === "CUSTOMER_CONFIRMED", "commission charged because the customer contradicted the restaurant", { v: o2.customerVerdict, c: o2.commission });
  await c.reload({ waitUntil: "networkidle" });
  check((await c.getByTestId("verdict-box").count()) === 0, "the question doesn't come back");

  // 4. The admin sees it
  const actx = await b.newContext({ baseURL: BASE, viewport: { width: 1366, height: 900 } });
  const a = await login(actx, process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234");
  await a.goto("/admin/orders?f=contradicted", { waitUntil: "networkidle" });
  const row = a.locator("tr", { hasText: ref });
  check((await row.count()) > 0 && (await row.innerText()).includes("customer says they received it"), "admin 'Customer disagrees' list shows the order with both versions");
  await a.screenshot({ path: `${SHOTS}/dispute-admin.png` });
  check((await db.notification.count({ where: { audience: "ADMIN", type: "ORDER_CONTRADICTED", title: { contains: ref } } })) === 1, "admin notified");
  check((await db.notification.count({ where: { restaurantId: o2.restaurantId, type: "ORDER_CONTRADICTED", createdAt: { gte: o2.customerVerdictAt } } })) === 1, "restaurant notified");

  await b.close();
  await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
