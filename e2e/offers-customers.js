// NumOffers (first chip on Explore, banner on Restaurants, the offers page) and the restaurant's
// customer list with its CSV download.
//   BASE_URL=http://localhost:3000 node e2e/offers-customers.js
const fs = require("fs");
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const SHOTS = process.env.SHOTS || "/tmp";

(async () => {
  const db = new PrismaClient();
  const bh = await db.restaurant.findFirstOrThrow({ where: { slug: "burger-house" } });
  const burger = await db.menuItem.findFirstOrThrow({ where: { restaurantId: bh.id, name: "Double Smash Burger" } });
  await db.deal.updateMany({ where: { restaurantId: bh.id, endedAt: null }, data: { endedAt: new Date() } });
  const deal = await db.deal.create({ data: { restaurantId: bh.id, kind: "PERCENT_OFF", percent: 20, menuItemId: burger.id } });
  const withDeals = await db.deal.findMany({ where: { endedAt: null, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }], restaurant: { status: "ACTIVE", restrictPromotion: false } }, distinct: ["restaurantId"], select: { restaurantId: true } });
  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  await ctx.addCookies([{ name: "nn_lang", value: "en", url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  try {
    console.log("\nNumOffers");
    await p.goto("/explore", { waitUntil: "load" }); await settle(p);
    const chips = await p.locator(".chip").allInnerTexts();
    check(chips[0]?.trim() === "All" && /NumOffers/.test(chips[1] || ""), "Explore: NumOffers is the first category, right after All", chips.slice(0, 3));
    await p.getByTestId("numoffers-chip").click();
    await p.waitForURL(/\/offers$/); await settle(p);
    const offers = await p.locator("[data-testid=offer-restaurant]").allInnerTexts();
    check(offers.length === withDeals.length, `lists every restaurant with a live offer (${withDeals.length})`, offers.length);
    const bhOffer = p.locator("[data-testid=offer-restaurant]").filter({ hasText: "Burger House" });
    check((await bhOffer.getByTestId("offer-badge").first().innerText()).includes("20% off Double Smash Burger"), "with the offer: “20% off Double Smash Burger”");
    const dish = await bhOffer.getByTestId("offer-dish").first().innerText();
    check(dish.includes("Double Smash Burger") && dish.includes("$6.00") && dish.includes("$7.50"), "and the dish at its offer price ($6.00, $7.50 crossed out)", dish);
    await p.screenshot({ path: `${SHOTS}/numoffers.png`, fullPage: true });
    await bhOffer.getByTestId("offer-dish").first().click();
    await p.waitForURL(/\/item\//, { timeout: 10000 });
    check(true, "tapping the dish opens it, ready to order");
    await p.goto("/restaurants", { waitUntil: "load" }); await settle(p);
    const banner = await p.getByTestId("numoffers-banner").innerText().catch(() => "");
    check(banner.includes("NumOffers") && banner.includes(withDeals.length === 1 ? "1 restaurant with" : `${withDeals.length} restaurants`), "Restaurants page: the NumOffers banner comes first", banner);
    await ctx.addCookies([{ name: "nn_lang", value: "ar", url: BASE }]);
    await p.goto("/offers", { waitUntil: "load" }); await settle(p);
    check((await p.locator("main").innerText()).includes("عروض وتخفيضات الآن"), "in Arabic too");

    console.log("\nThe restaurant's customers");
    const o = await (await b.newContext({ viewport: { width: 1360, height: 900 }, baseURL: BASE, acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "10.4.5.9" } })).newPage();
    o.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await o.goto("/login"); await o.fill("#email", "owner@burgerhouse.demo"); await o.fill("#password", "demo1234");
    await o.locator("form button[type=submit]").click(); await o.waitForURL((u) => !u.pathname.startsWith("/login"));
    await o.goto("/dashboard/customers", { waitUntil: "load" }); await settle(o);
    const expected = (await db.order.groupBy({ by: ["customerPhone"], where: { restaurantId: bh.id, status: "COMPLETED", NOT: { customerPhone: "" } } })).length;
    const rows = await o.locator("[data-testid=customer-row]").count();
    check(rows === Math.min(expected, 50) && (await o.getByTestId("customers-total").innerText()).includes(String(expected)), `one row per customer who ordered (${expected})`, rows);
    if (rows) {
      const first = await o.locator("[data-testid=customer-row]").first().innerText();
      check(/\d/.test(first), "with name, mobile, address and number of orders", first.replace(/\s+/g, " "));
    }
    const [download] = await Promise.all([o.waitForEvent("download"), o.getByTestId("customers-csv").click()]);
    const file = await download.path();
    const csv = fs.readFileSync(file, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
    check(csv[0] === "Name,Phone,Address,Area,Orders,Total spent (USD),First order,Last order" && csv.length === expected + 1, `Download CSV: ${download.suggestedFilename()} with every customer`, [csv[0], csv.length]);
    await o.screenshot({ path: `${SHOTS}/dashboard-customers.png` });
    await o.context().close();
  } finally {
    await db.deal.delete({ where: { id: deal.id } }).catch(() => {});
  }
  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
