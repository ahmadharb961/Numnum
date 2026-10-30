// Screens & checks for: install gate, distance delivery, login-to-order, rating popup, insights + PDF.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const OUT = process.env.SHOTS || require("os").tmpdir();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const HAMRA = { latitude: 33.8995, longitude: 35.4807 };
const TRIPOLI = { latitude: 34.4367, longitude: 35.8497 };

async function login(ctx, email, pw) {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Log in" }).click()]);
  return page;
}
async function dismissRating(p) {
  await p.waitForTimeout(800);
  const btn = p.getByRole("dialog", { name: "How was your order?" }).getByRole("button", { name: "Not now" });
  if (await btn.count()) await btn.click();
  await p.waitForTimeout(300);
}
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // 1. Restaurant must install + allow notifications (gate preview in automation)
  for (const [dev, name] of [["iPhone 13", "01-gate-iphone"], ["Pixel 7", "02-gate-android"]]) {
    const ctx = await browser.newContext({ ...devices[dev], baseURL: BASE });
    const p = await login(ctx, "owner@burgerhouse.demo", "demo1234");
    await p.goto("/dashboard?gate=preview", { waitUntil: "networkidle" });
    await p.waitForSelector("text=Add numnum to your home screen");
    await shot(p, name);
    await ctx.close();
  }
  const desk = await browser.newContext({ viewport: { width: 1280, height: 860 }, baseURL: BASE });
  const dp = await login(desk, "owner@burgerhouse.demo", "demo1234");
  await dp.goto("/dashboard/orders?gate=preview", { waitUntil: "networkidle" });
  console.log("desktop notifications banner:", await dp.locator("text=Turn on notifications").count());
  await shot(dp, "03-desktop-notify-banner");

  // 2. Insights (desktop + mobile) and PDF
  await dp.goto("/dashboard/insights?days=30", { waitUntil: "networkidle" });
  await dp.locator("[aria-label^='Daily'] button").nth(20).hover();
  await shot(dp, "04-insights-desktop", true);
  const pdf = await dp.request.get("/api/dashboard/insights/pdf?days=30");
  fs.writeFileSync(`${OUT}/insights.pdf`, await pdf.body());
  console.log("insights pdf:", pdf.status(), pdf.headers()["content-type"]);
  const csv = await dp.request.get("/api/dashboard/insights/orders?days=30");
  console.log("orders csv rows:", (await csv.text()).trim().split("\n").length - 1);
  await dp.goto("/dashboard/settings#ordering", { waitUntil: "networkidle" });
  await dp.locator("#ordering").scrollIntoViewIfNeeded();
  await dp.waitForTimeout(1500);
  await dp.locator("#ordering").screenshot({ path: `${OUT}/05-delivery-zones.png` });

  // 3. Customer: browse as guest; checkout requires login
  const guest = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, geolocation: HAMRA, permissions: ["geolocation"] });
  const g = await guest.newPage();
  g.on("pageerror", (e) => errors.push(e.message));
  await g.goto("/r/burger-house", { waitUntil: "networkidle" });
  await g.getByLabel("Add Double Smash Burger").click();
  await g.getByRole("button", { name: /Add to cart/ }).click();
  await g.goto("/checkout", { waitUntil: "networkidle" });
  await shot(g, "06-login-to-order");

  // 4. Logged-in customer in Tripoli can't get delivery from Beirut
  const far = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, geolocation: TRIPOLI, permissions: ["geolocation"] });
  const f = await login(far, "buyer2@numnum.demo", "demo1234");
  await f.evaluate(() => (document.cookie = `nn_loc=${encodeURIComponent(JSON.stringify({ lat: 34.4367, lng: 35.8497, label: "Tripoli" }))}; path=/`));
  await f.goto("/restaurants", { waitUntil: "networkidle" });
  await dismissRating(f);
  await shot(f, "07-restaurants-from-tripoli");
  await f.goto("/r/burger-house", { waitUntil: "networkidle" });
  await shot(f, "08-profile-out-of-range");
  await f.getByLabel("Add Double Smash Burger").click();
  await f.getByRole("button", { name: /Add to cart/ }).click();
  await f.goto("/checkout", { waitUntil: "networkidle" });
  await f.getByRole("button", { name: /Delivery/ }).first().click();
  await f.getByRole("button", { name: "Continue" }).click();
  await f.waitForTimeout(2500);
  await f.fill("#address", "Mina street");
  await f.getByRole("button", { name: "Review order" }).click();
  await f.waitForTimeout(500);
  console.log("tripoli blocked:", (await f.locator("text=/delivers up to/").first().textContent()).trim());
  await shot(f, "09-checkout-out-of-range", true);

  // 5. Logged-in customer in Hamra: pin on map, fee by distance
  const near = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, geolocation: HAMRA, permissions: ["geolocation"] });
  const n = await login(near, "buyer3@numnum.demo", "demo1234");
  n.on("pageerror", (e) => errors.push(e.message));
  await n.goto("/r/burger-house", { waitUntil: "networkidle" });
  await dismissRating(n);
  await n.getByLabel("Add Double Smash Burger").click();
  await n.getByRole("button", { name: /Add to cart/ }).click();
  await n.goto("/checkout", { waitUntil: "networkidle" });
  await n.getByRole("button", { name: /Delivery/ }).first().click();
  await n.getByRole("button", { name: "Continue" }).click();
  await n.waitForTimeout(1000);
  if (await n.getByRole("button", { name: "Deliver to a new address" }).count()) await n.getByRole("button", { name: "Deliver to a new address" }).click();
  await n.waitForSelector("text=/away · delivery/", { timeout: 15000 });
  await n.fill("#area", "Hamra");
  await n.fill("#address", "Bliss street, near AUB gate");
  await shot(n, "10-checkout-map-pin", true);
  await n.getByRole("button", { name: "Review order" }).click();
  await n.waitForSelector("button:has-text('Place order ·')");
  await n.getByRole("button", { name: /Place order/ }).click();
  await n.waitForURL(/\/order\/NN-/);
  console.log("hamra order placed:", n.url().match(/NN-[\d-]+/)[0]);
  await n.goto("/", { waitUntil: "networkidle" });
  await shot(n, "11-feed-location-chip");

  // 6. Rating popup for a delivered order
  const rc = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const r = await login(rc, "customer@numnum.demo", "demo1234");
  await r.goto("/restaurants", { waitUntil: "networkidle" });
  await r.waitForSelector("text=How was your order?");
  await r.getByRole("radio", { name: "5 stars" }).first().click();
  await r.waitForTimeout(300);
  await shot(r, "12-rating-popup");
  console.log("ERRORS:", errors);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
