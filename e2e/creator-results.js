// A creator's results as proof for restaurants: detailed insights (all time, per restaurant, latest
// orders), "Show my results to restaurants" → a verified results page, a badge on the profile, and
// the restaurant's Find creators list. Turned off: private again.
//   BASE_URL=http://localhost:3000 node e2e/creator-results.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const SHOTS = process.env.SHOTS || "/tmp";
let ip = 30;

(async () => {
  const db = new PrismaClient();
  const foodies = await db.creator.findFirstOrThrow({ where: { handle: "mr.foodies" } });
  await db.creator.update({ where: { id: foodies.id }, data: { shareResults: false } });
  // An order placed from his reel (completed), so there's something to show.
  const reel = await db.reel.findFirst({ where: { creatorId: foodies.id, visibility: "PUBLISHED" }, select: { id: true, restaurantId: true, restaurant: { select: { displayName: true } } } });
  const order = reel && (await db.order.findFirst({ where: { restaurantId: reel.restaurantId, status: "COMPLETED" }, orderBy: { createdAt: "desc" } }));
  const ev = order ? await db.analyticsEvent.create({ data: { type: "order_placed", restaurantId: reel.restaurantId, orderId: order.id, data: { reelIds: [reel.id] } } }) : null;
  const b = await chromium.launch();
  const errors = [];
  async function as(email, password = "demo1234", desktop = false) {
    const ctx = await b.newContext({ ...(desktop ? { viewport: { width: 1360, height: 900 } } : devices["iPhone 13"]), baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.4.${ip++}` } });
    await ctx.addCookies([{ name: "nn_lang", value: "en", url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email || "guest"}: ${String(e).slice(0, 160)}`));
    if (email) {
      await p.goto("/login"); await p.fill("#email", email); await p.fill("#password", password);
      await p.locator("form button[type=submit]").click(); await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    }
    return p;
  }
  try {
    check(!!ev, `(an order from his reel at ${reel?.restaurant.displayName})`);
    console.log("\nThe creator's insights");
    const m = await as("mrfoodies@numnum.demo");
    await m.goto("/creator/insights", { waitUntil: "load" }); await settle(m);
    const allTime = (await m.getByTestId("creator-all-time").innerText()).replace(/\s+/g, " ");
    check(/completed orders from your reels/.test(allTime) && /orders per 1,000 views/.test(allTime) && /food sales/.test(allTime), "All time: completed orders, orders per 1,000 views, food sales, restaurants", allTime);
    check((await m.getByTestId("creator-restaurant-stats").innerText()).includes(reel.restaurant.displayName), "orders per restaurant");
    const recent = await m.getByTestId("creator-recent-orders").innerText();
    check(recent.includes(reel.restaurant.displayName) && /Completed/.test(recent), "the latest orders from his reels: dish, restaurant, time, amount, status", recent.split("\n").slice(0, 4));
    check(!(await m.getByTestId("creator-recent-orders").innerText()).includes(order.customerPhone.slice(-6)), "without customers' details");
    await m.screenshot({ path: `${SHOTS}/creator-insights-results.png`, fullPage: true });

    console.log("\nSharing with restaurants");
    await m.getByTestId("share-results-toggle").click();
    await m.getByTestId("share-results-send").waitFor({ timeout: 10000 });
    for (let i = 0; i < 20 && !(await db.creator.findUnique({ where: { id: foodies.id } })).shareResults; i++) await m.waitForTimeout(250);
    check((await db.creator.findUnique({ where: { id: foodies.id } })).shareResults, "“Show my results to restaurants” turned on");
    await m.getByTestId("share-results-send").click();
    const wa = decodeURIComponent((await m.getByTestId("share-whatsapp").getAttribute("href")) || "");
    check(wa.includes(`/c/${foodies.handle}/results`) && /orders from my food reels/.test(wa), "“Send to a restaurant”: WhatsApp with his results link", wa.slice(0, 160));
    await m.context().close();

    console.log("\nWhat a restaurant sees");
    const v = await as(null);
    await v.goto(`/c/${foodies.handle}`, { waitUntil: "load" }); await settle(v);
    const badge = await v.getByTestId("results-badge").innerText().catch(() => "");
    check(/orders? from their reels/.test(badge), "his profile shows the proof: “📈 N orders from their reels · See results”", badge);
    await v.getByTestId("results-badge").click();
    await v.waitForURL(/\/results$/); await settle(v);
    check((await v.getByTestId("results-verified").innerText()).includes("Counted by numnum from real orders"), "results page: “Counted by numnum from real orders…”");
    const page = (await v.getByTestId("creator-results").innerText()).replace(/\s+/g, " ");
    check(/completed orders from their reels/.test(page) && /orders per 1,000 views/.test(page) && page.includes(reel.restaurant.displayName), "with orders, order rate, views, sales and the restaurants he brought orders to", page.slice(0, 200));
    await v.screenshot({ path: `${SHOTS}/creator-results-page.png`, fullPage: true });
    const o = await as("owner@burgerhouse.demo", "demo1234", true);
    await o.goto("/dashboard/find-creators", { waitUntil: "load" }); await settle(o);
    const card = o.locator("[data-testid=find-creator]").filter({ hasText: `@${foodies.handle}` });
    check(await card.isVisible(), "Restaurant dashboard → Find creators lists him, with his numbers");
    check((await card.innerText()).includes("orders brought"), "orders brought, views, order rate, restaurants, sales, and how to reach him");
    await o.screenshot({ path: `${SHOTS}/find-creators.png` });

    console.log("\nTurned off");
    const m2 = await as("mrfoodies@numnum.demo");
    await m2.goto("/creator/insights", { waitUntil: "load" }); await settle(m2);
    await m2.getByTestId("share-results-toggle").click();
    for (let i = 0; i < 20 && (await db.creator.findUnique({ where: { id: foodies.id } })).shareResults; i++) await m2.waitForTimeout(250);
    const status = (await v.goto(`/c/${foodies.handle}/results`)).status();
    check(status === 404, "his results page is private again (404 for others)", status);
    await v.goto(`/c/${foodies.handle}`, { waitUntil: "load" }); await settle(v);
    check((await v.getByTestId("results-badge").count()) === 0, "and the badge is gone");
    await o.goto("/dashboard/find-creators", { waitUntil: "load" }); await settle(o);
    check((await o.locator("[data-testid=find-creator]").filter({ hasText: `@${foodies.handle}` }).count()) === 0, "and he's not in Find creators");
  } finally {
    if (ev) await db.analyticsEvent.delete({ where: { id: ev.id } }).catch(() => {});
    await db.creator.update({ where: { id: foodies.id }, data: { shareResults: false } });
  }
  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
