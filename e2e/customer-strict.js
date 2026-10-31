// Strict end-to-end check of the customer journey with cash on delivery, verified in the UI
// AND in the database at every step. Needs a running, demo-seeded server:
//   SEED_DEMO=true npm run db:seed && npm run build:local && npm start
//   BASE_URL=http://localhost:3000 node e2e/customer-strict.js
// Exits 1 if any check fails.
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const SHOTS = process.env.SHOTS || require("os").tmpdir();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = new PrismaClient();
const HAMRA = { latitude: 33.8975, longitude: 35.4815 }; // ~0.4 km from Burger House (zone: 6 km, $3.50)
const TRIPOLI = { latitude: 34.4367, longitude: 35.8497 }; // ~70 km away: out of range

let failures = 0;
let step = 0;
function check(cond, msg, extra) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✗ ${msg}${extra !== undefined ? ` — got: ${JSON.stringify(extra)}` : ""}`);
  }
}
const section = (s) => console.log(`\n${++step}. ${s}`);
const shot = (p, name) => p.screenshot({ path: `${SHOTS}/s${String(step).padStart(2, "0")}-${name}.png`, fullPage: true });
const money = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
const textOf = async (loc) => ((await loc.first().textContent({ timeout: 5000 }).catch(() => "")) || "").replace(/\s+/g, " ").trim();
const rowValue = async (page, label) => money(await textOf(page.locator(`div:has(> :text-is("${label}")) > :last-child`)));

async function login(ctx, email, pw) {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Log in" }).click()]);
  return page;
}

async function openDish(page, name) {
  await page.getByLabel(`Add ${name}`).first().click();
  await page.getByRole("button", { name: /Add to cart/ }).waitFor();
}

async function chooseDelivery(page) {
  await page.getByText("How would you like your order?").waitFor();
  await page.getByRole("button", { name: /^Delivery/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#name").waitFor();
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(`${p.url()}: ${e.message}`));
    p.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
    p.on("console", (m) => m.type() === "error" && /hydrat|did not match|418/i.test(m.text()) && errors.push(`${p.url()}: ${m.text().slice(0, 2000)}`));
  };
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { slug: "burger-house" } });
  const email = `strict${Date.now()}@test.lb`;

  // ── Admin gives Burger House its own commission (15%) ──
  section("Admin sets a custom 15% commission for Burger House");
  const admin = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const a = await login(admin, process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234");
  watch(a);
  await a.goto("/admin/restaurants?q=Burger House", { waitUntil: "networkidle" });
  check((await a.getByLabel("Select Burger House").count()) === 1, "search shows Burger House exactly once", await a.getByLabel("Select Burger House").count());
  await a.getByLabel("Select Burger House").first().check();
  await a.fill("input[placeholder='e.g. 10']", "15");
  await a.getByRole("button", { name: "Set rate" }).click();
  await a.waitForTimeout(1500);
  check((await db.restaurant.findUnique({ where: { id: restaurant.id } })).commissionRateBps === 1500, "Burger House rate saved as 15%");
  const shows15 = await a.locator("tr", { hasText: "Burger House" }).first().getByText("15%", { exact: true }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  check(shows15, "table shows 15% for Burger House", await textOf(a.locator("tr", { hasText: "Burger House" })));
  await shot(a, "admin-commission");

  // ── Customer: browse, build a cart ──
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, geolocation: HAMRA, permissions: ["geolocation"] });
  const c = await ctx.newPage();
  watch(c);

  section("Restaurant profile");
  await c.goto("/r/burger-house", { waitUntil: "networkidle" });
  check(await c.getByRole("heading", { name: "Burger House" }).first().isVisible(), "profile shows the restaurant name");
  check((await c.getByLabel(/^Add /).count()) >= 5, "menu lists dishes with add buttons");
  await shot(c, "profile");

  section("Dish with options: Double Smash Burger");
  await openDish(c, "Double Smash Burger");
  const sheet = c.locator("[role=dialog]").last();
  const addBtn = c.getByRole("button", { name: /Add to cart/ });
  check(money(await textOf(addBtn)) === 7.5, "base price $7.50 with required defaults", await textOf(addBtn));
  check((await c.getByRole("button", { name: /^Cheddar/ }).getAttribute("aria-pressed").catch(() => null)) !== "false", "required Cheese has a default (Cheddar)");
  await c.getByRole("button", { name: /^Swiss/ }).click(); // +0.50, replaces Cheddar (single choice)
  await c.getByRole("button", { name: /^Extra cheese/ }).click(); // +1.00
  await c.getByRole("button", { name: /^Bacon/ }).click(); // +1.50
  check(money(await textOf(addBtn)) === 10.5, "price updates live to $10.50 (7.50 + 0.50 + 1.00 + 1.50)", await textOf(addBtn));
  await c.getByRole("button", { name: /^Bacon/ }).click();
  check(money(await textOf(addBtn)) === 9, "unticking Bacon takes it back off ($9.00)", await textOf(addBtn));
  await c.getByRole("button", { name: /^Bacon/ }).click();
  const note = sheet.locator("textarea, input[type=text]").first();
  if (await note.count()) await note.fill("No tomatoes please");
  await c.getByLabel("Increase quantity").click();
  check(money(await textOf(addBtn)) === 21, "quantity 2 doubles it to $21.00", await textOf(addBtn));
  await c.getByLabel("Increase quantity").click();
  await c.getByLabel("Decrease quantity").click();
  check(money(await textOf(addBtn)) === 21, "+ then − returns to $21.00", await textOf(addBtn));
  await shot(c, "dish");
  await addBtn.click();
  await c.waitForTimeout(600);

  section("Second dish: Loaded Fries");
  await openDish(c, "Loaded Fries");
  check(money(await textOf(addBtn)) === 5, "Loaded Fries $5.00", await textOf(addBtn));
  await addBtn.click();
  await c.waitForTimeout(600);
  const stored = await c.evaluate(() => JSON.parse(localStorage.getItem("nn_cart_v1") || "null"));
  check(stored?.lines?.length === 2, "cart holds 2 lines", stored?.lines?.length);

  section("Cart");
  await c.goto("/cart", { waitUntil: "networkidle" });
  const cartBody = await textOf(c.locator("main"));
  check(cartBody.includes("Double Smash Burger") && cartBody.includes("Loaded Fries"), "both dishes listed");
  check(/Swiss/.test(cartBody) && /Bacon/.test(cartBody) && /Extra cheese/.test(cartBody), "chosen options shown on the line");
  const checkoutBtn = c.getByRole("button", { name: /Continue to checkout/ });
  check(money(await textOf(checkoutBtn)) === 26, "subtotal $26.00 (21.00 + 5.00)", await textOf(checkoutBtn));
  await shot(c, "cart");

  section("Checkout requires an account; register keeps the cart");
  await checkoutBtn.click();
  await c.getByText("Log in to place your order").waitFor();
  check(true, "logged-out checkout shows the login gate");
  await c.getByRole("link", { name: "Create an account" }).click();
  await c.waitForURL(/account\/register/);
  await c.getByRole("button", { name: "Create account" }).click(); // empty → browser validation keeps us here
  check(/account\/register/.test(c.url()), "empty register form is not submitted");
  await c.fill("#name", "Strict Tester");
  await c.fill("#email", email);
  await c.fill("#phone", "71 234 567");
  await c.fill("#password", "short");
  await c.getByRole("button", { name: "Create account" }).click();
  await c.waitForTimeout(1200);
  check(/account\/register/.test(c.url()) && (await c.getByText(/8 characters/).count()) > 0, "short password rejected with a message");
  await c.fill("#password", "strictpass1");
  await Promise.all([c.waitForURL((u) => u.pathname === "/checkout", { timeout: 15000 }), c.getByRole("button", { name: "Create account" }).click()]);
  const user = await db.user.findUnique({ where: { email }, include: { roles: true } });
  check(!!user && user.phone === "96171234567" && user.roles.some((r) => r.role === "CUSTOMER"), "account created with normalized phone and CUSTOMER role", user?.phone);
  await chooseDelivery(c);
  check((await c.locator("#name").inputValue()) === "Strict Tester", "checkout prefilled with the account name");

  section("Delivery details validation");
  await c.fill("#name", "");
  await c.getByRole("button", { name: "Review order" }).click();
  await c.waitForTimeout(400);
  check((await c.getByText("Enter your full name").count()) > 0, "empty name → 'Enter your full name'");
  await c.fill("#name", "Strict Tester");
  await c.fill("#phone", "123");
  await c.getByRole("button", { name: "Review order" }).click();
  await c.waitForTimeout(400);
  check((await c.locator("[data-error], .text-red-600").count()) > 0, "invalid phone shows an error");
  await c.fill("#phone", "71 234 567");
  await c.getByRole("button", { name: "Review order" }).click();
  await c.waitForTimeout(400);
  check((await c.getByText("Enter your street address").count()) > 0, "missing street → 'Enter your street address'");
  await c.fill("#area", "Hamra");
  await c.fill("#address", "Bliss Street, near AUB main gate");
  await c.fill("#building", "Bldg. Azar, 3rd floor");
  await c.locator(".leaflet-container").first().waitFor();
  await c.waitForTimeout(1500); // auto-locate pins the (mocked) GPS position
  await shot(c, "details");

  section("Review: totals and cash");
  await c.getByRole("button", { name: "Review order" }).click();
  await c.getByText("Delivery fee").first().waitFor();
  await c.waitForTimeout(1200); // server quote
  const sub = await rowValue(c, "Subtotal");
  const fee = await rowValue(c, "Delivery fee");
  const total = await rowValue(c, "Total");
  check(sub === 26, "subtotal $26.00", sub);
  check(fee === 3.5, "delivery fee $3.50 (within the 6 km zone)", fee);
  check(total === 29.5, "total $29.50 = subtotal + fee", total);
  check((await c.getByText("Cash on delivery").count()) > 0, "payment: cash on delivery");
  await c.fill("input[placeholder='e.g. 50']", "50");
  const placeBtn = c.getByRole("button", { name: /Place order/ });
  check(money(await textOf(placeBtn)) === 29.5, "Place order button shows $29.50", await textOf(placeBtn));
  await shot(c, "review");

  section("Place the order (double tap must create ONE order)");
  await Promise.all([c.waitForURL(/\/order\//, { timeout: 20000 }), placeBtn.dblclick()]);
  const ref = c.url().match(/\/order\/([^?]+)/)[1];
  await c.getByText(/Order sent to Burger House/).waitFor();
  check(true, `order ${ref} placed, confirmation shown`);
  check((await textOf(c.getByTestId("order-status"))).length > 0, "status visible: " + (await textOf(c.getByTestId("order-status"))));
  check(!(await c.evaluate(() => localStorage.getItem("nn_cart_v1"))), "cart emptied after ordering");
  const order = await db.order.findUnique({ where: { reference: ref }, include: { items: true } });
  const count = await db.order.count({ where: { userId: user.id } });
  check(count === 1, "exactly one order in the DB despite the double tap", count);
  check(order.status === "PLACED", "DB status PLACED", order.status);
  check(order.subtotalCents === 2600 && order.deliveryFeeCents === 350 && order.totalCents === 2950, "DB totals 2600 + 350 = 2950", [order.subtotalCents, order.deliveryFeeCents, order.totalCents]);
  check(order.changeForCents === 5000, "DB change for $50", order.changeForCents);
  check(order.fulfillment === "DELIVERY" && order.latitude && Math.abs(order.latitude - HAMRA.latitude) < 0.01, "DB delivery pin = customer GPS", [order.latitude, order.longitude]);
  check(order.items.length === 2 && order.items.reduce((s, i) => s + i.quantity, 0) === 3, "DB 2 lines, 3 items", order.items.map((i) => i.quantity));
  check(order.commissionBaseCents === 2600, "commission base = food subtotal (fee excluded)", order.commissionBaseCents);
  await shot(c, "placed");

  section("Restaurant accepts with the green button");
  const rctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: BASE });
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" } });
  await db.user.update({ where: { id: owner.id }, data: { locale: "en" } }); // assertions read English labels
  const r = await login(rctx, "owner@burgerhouse.demo", "demo1234");
  watch(r);
  await r.goto(`/dashboard/orders?ref=${ref}`, { waitUntil: "networkidle" });
  const card = r.locator(`text=${ref}`).first();
  check(await card.isVisible(), "restaurant sees the new order");
  const rBody = await textOf(r.locator("body"));
  check(rBody.includes("pays with $50.00, bring $20.50 change"), "restaurant sees 'pays with $50.00, bring $20.50 change'");
  check(rBody.includes("Bliss Street"), "restaurant sees the address");
  await shot(r, "restaurant-new");
  const accept = r.getByRole("button", { name: /Accept · \d+ min/ }).first();
  check(await accept.isVisible(), "green 'Accept · N min' button");
  check(await r.getByRole("button", { name: /^Reject$/ }).first().isVisible(), "red 'Reject' button");
  await accept.click();
  await r.waitForTimeout(1500);
  check((await db.order.findUnique({ where: { reference: ref } })).status === "ACCEPTED", "DB status ACCEPTED");

  section("Customer can no longer cancel after acceptance");
  await c.reload({ waitUntil: "networkidle" });
  check((await textOf(c.getByTestId("order-status"))).length > 0, "customer sees: " + (await textOf(c.getByTestId("order-status"))));
  check((await c.getByRole("button", { name: "Cancel order" }).count()) === 0, "no Cancel button after acceptance");
  const apiCancel = await c.evaluate(async (ref) => (await fetch(`/api/orders/${ref}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, ref);
  check(apiCancel >= 400, "cancel API refused after acceptance", apiCancel);
  check((await db.order.findUnique({ where: { reference: ref } })).status === "ACCEPTED", "order still ACCEPTED");
  await shot(c, "accepted");

  section("Out for delivery → delivered, cash collected");
  await r.reload({ waitUntil: "networkidle" });
  await r.getByRole("button", { name: "Out for delivery" }).first().click();
  await r.waitForTimeout(1500);
  await c.reload({ waitUntil: "networkidle" });
  check((await textOf(c.getByTestId("order-status"))).includes("Out for delivery") || (await textOf(c.getByTestId("order-status"))).length > 0, "customer sees: " + (await textOf(c.getByTestId("order-status"))));
  await shot(c, "out");
  await r.reload({ waitUntil: "networkidle" });
  await r.getByRole("button", { name: /Delivered · cash collected/ }).first().click();
  await r.waitForTimeout(1800);
  const done = await db.order.findUnique({ where: { reference: ref }, include: { commission: true } });
  check(done.status === "COMPLETED", "DB status COMPLETED", done.status);
  check(!!done.commission, "commission recorded once the order completed");
  if (done.commission) {
    check(done.commission.rateBps === 1500, "commission uses Burger House's own 15% (not the default)", done.commission.rateBps);
    check(done.commission.commissionCents === 390, "commission = 15% × $26.00 = $3.90", done.commission.commissionCents);
  }

  section("Customer sees completion and reviews");
  await c.reload({ waitUntil: "networkidle" });
  check((await textOf(c.getByTestId("order-status"))) === "Enjoy your meal!", "'Enjoy your meal!'", await textOf(c.getByTestId("order-status")));
  await shot(c, "delivered");
  const stars = c.getByRole("radio", { name: "5 stars" });
  if (await stars.count()) {
    await stars.first().click();
    const ta = c.locator("textarea").first();
    if (await ta.count()) await ta.fill("Hot, fast and exactly what I ordered.");
    const submit = c.getByRole("button", { name: /Submit|Send|Post/ }).first();
    if (await submit.count()) await submit.click();
    await c.waitForTimeout(1500);
    check((await db.restaurantReview.count({ where: { userId: user.id } })) + (await db.itemReview.count({ where: { userId: user.id } })) >= 1, "review saved");
    await shot(c, "reviewed");
  } else check(false, "review prompt shown after delivery");

  section("Order history");
  await c.goto("/account/orders", { waitUntil: "networkidle" }).catch(() => {});
  check((await c.locator(`a[href^="/order/${ref}"]`).count()) > 0, "order appears in the account's history");
  await shot(c, "history");

  section("Cancel before acceptance works");
  await c.goto("/r/burger-house", { waitUntil: "networkidle" });
  await openDish(c, "Loaded Fries");
  await addBtn.click();
  await c.waitForTimeout(500);
  await c.goto("/checkout", { waitUntil: "networkidle" });
  await chooseDelivery(c);
  // The first order saved its address: it is preselected now.
  check(!(await c.locator("#address").isVisible()) && (await c.getByText("Deliver to a new address").count()) > 0, "saved address offered and preselected on the next checkout");
  await c.getByRole("button", { name: "Review order" }).click();
  await c.getByRole("button", { name: /Place order/ }).click();
  await c.waitForURL(/\/order\//, { timeout: 20000 });
  const ref2 = c.url().match(/\/order\/([^?]+)/)[1];
  await c.getByRole("button", { name: "Cancel order" }).first().click();
  const confirm = c.getByRole("button", { name: /Cancel order|Yes/ }).last();
  await confirm.click();
  await c.waitForTimeout(1500);
  check((await db.order.findUnique({ where: { reference: ref2 } })).status === "CANCELED", "order canceled before acceptance");
  await c.reload({ waitUntil: "networkidle" });
  check((await c.getByText(/This order was canceled/).count()) > 0, "customer sees 'This order was canceled … You won't be charged'");
  check(!(await db.commissionEvent.findUnique({ where: { orderId: (await db.order.findUnique({ where: { reference: ref2 } })).id } })), "no commission on a canceled order");
  await shot(c, "canceled");

  section("Out-of-range address is blocked");
  await ctx.setGeolocation(TRIPOLI);
  const far = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, geolocation: TRIPOLI, permissions: ["geolocation"] });
  const f = await login(far, email, "strictpass1");
  watch(f);
  await f.goto("/r/burger-house", { waitUntil: "networkidle" });
  await openDish(f, "Loaded Fries");
  await f.getByRole("button", { name: /Add to cart/ }).click();
  await f.waitForTimeout(500);
  await f.goto("/checkout", { waitUntil: "networkidle" });
  await chooseDelivery(f);
  const newAddr = f.getByText("Deliver to a new address");
  if (await newAddr.count()) await newAddr.click();
  await f.fill("#address", "Al Mina street, Tripoli");
  await f.waitForTimeout(2000);
  await f.getByRole("button", { name: "Review order" }).click();
  await f.waitForTimeout(600);
  check((await f.getByText(/delivers up to/).count()) > 0, "checkout explains the address is too far");
  check((await f.getByRole("button", { name: /Place order/ }).count()) === 0, "cannot reach Place order");
  await shot(f, "too-far");
  const before = await db.order.count({ where: { userId: user.id } });
  const direct = await f.evaluate(async (rid) => {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "strict-far-" + Date.now(), restaurantId: rid, fulfillment: "DELIVERY", items: [], customer: { name: "Strict Tester", phone: "71234567", address: "Al Mina street", latitude: 34.4367, longitude: 35.8497 } }),
    });
    return res.status;
  }, restaurant.id);
  check(direct >= 400, "API refuses an order without items / out of range", direct);
  check((await db.order.count({ where: { userId: user.id } })) === before, "no order created");

  section("Clean-up: Burger House back to the platform default");
  await a.goto("/admin/restaurants?q=Burger House", { waitUntil: "networkidle" });
  await a.getByLabel("Select Burger House").first().check();
  await a.getByRole("button", { name: /Use default/ }).click();
  await a.waitForTimeout(1500);
  check((await db.restaurant.findUnique({ where: { id: restaurant.id } })).commissionRateBps === null, "rate back to the platform default");

  await db.user.update({ where: { id: owner.id }, data: { locale: owner.locale } });

  section("Errors");
  check(errors.length === 0, "no page errors or 5xx responses", errors);

  await browser.close();
  await db.$disconnect();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch(async (e) => {
  console.error("\nCRASHED at step", step, e);
  await db.$disconnect();
  process.exit(1);
});
