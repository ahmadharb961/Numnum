// Browser journeys for the cash-on-delivery flow. Needs a running, demo-seeded server:
//   SEED_DEMO=true npm run db:seed && npm run build:local && npm start
//   node e2e/customer.js
const { chromium, devices } = require("playwright");
const SHOTS = process.env.SHOTS || require("os").tmpdir();
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function login(ctx, email, pw, expect) {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Log in" }).click()]);
  if (expect) console.log(`${email} landed on`, new URL(page.url()).pathname);
  return page;
}

async function addBurger(page) {
  await page.goto("/r/burger-house", { waitUntil: "networkidle" });
  await page.getByLabel("Add Double Smash Burger").click();
  await page.waitForSelector("text=Add to cart");
  await page.getByRole("button", { name: /Extra cheese/ }).click();
  await page.getByRole("button", { name: /BBQ sauce/ }).click();
  await page.getByLabel("Increase quantity").click();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));

  // ── 1. Guest order: reel → dish → checkout → cash on delivery ──
  const guest = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const g = await guest.newPage();
  watch(g);
  await g.goto("/");
  await g.waitForSelector("section[data-index='0']");
  await g.locator("section[data-index='0']").getByRole("button", { name: /^Order/ }).click();
  await g.waitForSelector("text=Add to cart");
  await g.keyboard.press("Escape");
  await addBurger(g);
  await g.goto("/cart");
  await g.getByRole("button", { name: /Continue to checkout/ }).click();
  await g.getByRole("button", { name: /Delivery/ }).first().click();
  await g.getByRole("button", { name: "Continue" }).click();
  await g.fill("#name", "John Smith");
  await g.fill("#phone", "70 123 456");
  await g.selectOption("#area", "Hamra");
  await g.fill("#address", "Bliss street, near AUB main gate");
  await g.fill("#building", "Azar bldg, 3rd floor");
  await g.screenshot({ path: `${SHOTS}/c1-details.png`, fullPage: true });
  await g.getByRole("button", { name: "Review order" }).click();
  await g.waitForSelector("text=Cash on delivery");
  await g.waitForSelector("button:has-text('Place order ·')");
  await g.fill("input[placeholder='e.g. 50']", "50");
  await g.screenshot({ path: `${SHOTS}/c2-review.png`, fullPage: true });
  await g.getByRole("button", { name: /Place order/ }).click();
  await g.waitForURL(/\/order\/NN-/);
  await g.waitForSelector("text=Order sent to Burger House");
  const ref = g.url().match(/order\/(NN-[\d-]+)/)[1];
  console.log("guest order placed:", ref, "| banner:", await g.locator("text=Order sent to Burger House").count());
  await g.screenshot({ path: `${SHOTS}/c3-tracking-placed.png`, fullPage: true });
  console.log("cart emptied:", await g.evaluate(() => !localStorage.getItem("nn_cart_v1")));

  // ── 2. Restaurant accepts it; the customer sees the update ──
  const rctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: BASE });
  const r = await login(rctx, "owner@burgerhouse.demo", "demo1234", true);
  watch(r);
  await r.goto(`/dashboard/orders?ref=${ref}`);
  await r.screenshot({ path: `${SHOTS}/c4-restaurant-new.png`, fullPage: true });
  console.log("restaurant sees cash + change:", await r.locator("text=bring").count() > 0);
  await r.getByRole("button", { name: "30 min" }).first().click();
  await r.waitForTimeout(1500);
  await r.getByRole("button", { name: "Out for delivery" }).first().click();
  await r.waitForTimeout(1500);
  await g.reload();
  console.log("customer sees:", (await g.getByTestId("order-status").textContent()).trim(), "|", (await g.locator("text=/Arriving around/").first().textContent().catch(() => "no ETA")).trim());
  await g.screenshot({ path: `${SHOTS}/c5-tracking-out.png`, fullPage: true });
  await r.getByRole("button", { name: /Delivered · cash collected/ }).first().click();
  await r.waitForTimeout(1500);
  await g.reload();
  console.log("after delivery:", (await g.getByTestId("order-status").textContent()).trim(), "| reorder:", await g.getByRole("button", { name: /Order again/ }).count());

  // ── 3. Guest cancels a second order before acceptance ──
  await addBurger(g);
  await g.goto("/checkout");
  await g.getByRole("button", { name: /Pickup/ }).click();
  await g.getByRole("button", { name: "Continue" }).click();
  await g.getByRole("button", { name: "Review order" }).click(); // remembered details? (not ticked) → fill
  if (await g.locator("text=Enter your full name").count()) {
    await g.fill("#name", "John Smith");
    await g.fill("#phone", "70 123 456");
    await g.getByRole("button", { name: "Review order" }).click();
  }
  await g.waitForSelector("text=Cash at pickup");
  await g.waitForSelector("button:has-text('Place order ·')");
  await g.getByRole("button", { name: /Place order/ }).click();
  await g.waitForURL(/\/order\/NN-/);
  await g.getByRole("button", { name: "Cancel order" }).click();
  await g.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
  await g.waitForTimeout(1500);
  console.log("guest cancel:", (await g.getByTestId("order-status").textContent()).trim());

  // ── 4. Guest signs up → device orders join the account ──
  await g.goto("/account/register?next=/account/orders");
  await g.fill("#name", "John Smith");
  await g.fill("#email", `john${Date.now()}@test.dev`);
  await g.fill("#password", "supersecret1");
  await Promise.all([g.waitForURL(/account\/orders/), g.getByRole("button", { name: "Create account" }).click()]);
  await g.waitForSelector("a[href^='/order/']");
  console.log("orders claimed into new account:", await g.locator("a[href^='/order/']").count());
  await g.screenshot({ path: `${SHOTS}/c6-my-orders.png`, fullPage: true });

  // ── 5. Logged-in customer with a saved address ──
  const cctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const c = await login(cctx, "customer@numnum.demo", "demo1234");
  watch(c);
  await c.goto("/account/addresses");
  await c.waitForSelector("text=Saved addresses");
  console.log("saved addresses:", await c.locator("button:has-text('Delete')").count());
  await addBurger(c);
  await c.goto("/checkout");
  await c.getByRole("button", { name: /Delivery/ }).first().click();
  await c.getByRole("button", { name: "Continue" }).click();
  console.log("prefilled name:", await c.inputValue("#name"), "| saved address selected:", await c.locator("[role=radio][aria-checked=true]").count());
  await c.screenshot({ path: `${SHOTS}/c7-saved-address.png`, fullPage: true });
  await c.getByRole("button", { name: "Review order" }).click();
  await c.waitForSelector("button:has-text('Place order ·')");
  await c.getByRole("button", { name: /Place order/ }).click();
  await c.waitForURL(/\/order\/NN-/);
  await c.goto("/account");
  await c.waitForSelector("text=My orders");
  console.log("account shows active order:", await c.locator("text=Waiting for the restaurant").count());
  await c.screenshot({ path: `${SHOTS}/c8-account.png`, fullPage: true });

  for (const p of ["/", "/explore", "/restaurants", "/r/burger-house", "/saved", "/cart", "/account", "/account/orders", "/account/addresses"]) {
    await c.goto(p);
    await c.waitForTimeout(400);
    const ov = await c.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (ov > 0) errors.push(`overflow ${p} ${ov}px`);
  }
  console.log("ERRORS:", errors);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
