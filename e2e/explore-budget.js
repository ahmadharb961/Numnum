// A budget search on Explore → Reels: every result really is in the price range (LBP dishes too, by
// their dollar value), the tiles show dish and price, a reel opened from the results swipes through
// exactly those results, and Back returns to them with the filter kept.
//   BASE_URL=http://localhost:3000 node e2e/explore-budget.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});

(async () => {
  const db = new PrismaClient();
  const rate = ((await db.platformSetting.findUnique({ where: { key: "lbpPerUsd" } }))?.value) || 89500;
  // What a $3–$5 search must find: published, ready reels of active restaurants, priced $3–$5 in dollars.
  const all = await db.reel.findMany({
    where: { visibility: "PUBLISHED", status: "READY", restaurant: { status: "ACTIVE" }, menuItem: { archived: false }, OR: [{ creatorId: null }, { tagStatus: "ACCEPTED", creator: { status: "APPROVED" } }] },
    select: { id: true, menuItem: { select: { name: true, priceCents: true, currency: true } } },
  });
  const usd = (m) => (m.currency === "LBP" ? m.priceCents / Number(rate) : m.priceCents / 100);
  const expected = all.filter((r) => usd(r.menuItem) >= 3 && usd(r.menuItem) <= 5);
  const lbpIn = expected.filter((r) => r.menuItem.currency === "LBP");

  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  await ctx.addCookies([{ name: "nn_lang", value: "en", url: BASE }]);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  console.log("\nExplore → Reels → Filters: $3 – $5");
  await p.goto("/explore", { waitUntil: "load" }); await settle(p);
  await p.locator("button, a").filter({ hasText: /^Reels/ }).first().click();
  await p.getByRole("button", { name: /Filter/ }).first().click();
  await p.getByPlaceholder("Min").fill("3");
  await p.getByPlaceholder("Max").fill("5");
  await p.getByRole("button", { name: /Show|Apply|results/i }).last().click();
  await p.waitForURL(/minPrice=3/);
  await p.waitForFunction((n) => document.querySelectorAll("[data-testid=reel-thumb]").length === n, expected.length, { timeout: 10000 }).catch(() => {});
  const tiles = await p.locator("[data-testid=reel-thumb]").evaluateAll((as) => as.map((a) => ({ href: a.getAttribute("href"), text: a.innerText, price: a.querySelector("[data-testid=reel-thumb-price]")?.textContent ?? "" })));
  check(tiles.length === expected.length, `all ${expected.length} reels priced $3–$5 are shown, nothing else`, tiles.length);
  check(lbpIn.length === 0 || lbpIn.every((r) => tiles.some((t) => t.href.includes(r.id))), `dishes priced in LBP are found by their dollar value (${lbpIn.map((r) => r.menuItem.name).join(", ") || "none in the demo"})`);
  const toUsd = (s) => (/LBP/.test(s) ? Number(s.replace(/[^\d]/g, "")) / Number(rate) : Number(s.replace(/[^\d.]/g, "")));
  check(tiles.every((t) => t.price && toUsd(t.price) >= 3 && toUsd(t.price) <= 5), "every tile shows its dish and a price in the range", tiles.map((t) => t.price));
  await p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/budget-results.png` });

  console.log("\nOpening the 3rd result");
  const third = tiles[2];
  await p.locator("[data-testid=reel-thumb]").nth(2).click();
  await p.waitForURL(/\/explore\/reels\//, { timeout: 10000 });
  await settle(p);
  const title = await p.getByTestId("reel-list-title").innerText().catch(() => "");
  check(/\$3 – \$5/.test(title) && title.includes(`3 / ${expected.length}`), `says what it is and where you are: "$3 – $5 · 3 / ${expected.length}"`, title);
  const activeName = () => p.locator("section[data-active=true]").first().getAttribute("aria-label");
  check(((await activeName()) || "").length > 0 && third.text.split("\n")[0] && (await activeName()).startsWith(third.text.split("\n")[0]), "plays the reel tapped", { tile: third.text, playing: await activeName() });
  // Swipe up to the next result.
  await p.locator("section[data-index]").nth(3).scrollIntoViewIfNeeded();
  await p.waitForFunction(() => document.querySelector("section[data-active=true]")?.getAttribute("data-index") === "3", null, { timeout: 8000 }).catch(() => {});
  const fourth = tiles[3];
  check(((await activeName()) || "").startsWith(fourth.text.split("\n")[0]), "swiping shows the next result from the search, not the home feed", { next: fourth.text.split("\n")[0], playing: await activeName() });
  check((await p.locator("section[data-index]").count()) === expected.length, "and only the search results (no endless home feed after them)", await p.locator("section[data-index]").count());

  console.log("\nBack");
  await p.getByTestId("reel-back").click();
  await p.waitForURL((u) => u.pathname === "/explore", { timeout: 10000 });
  const u = new URL(p.url());
  check(u.searchParams.get("minPrice") === "3" && u.searchParams.get("maxPrice") === "5" && u.searchParams.get("type") === "reels", "returns to Explore → Reels with the $3–$5 filter kept", p.url());
  await p.waitForFunction((n) => document.querySelectorAll("[data-testid=reel-thumb]").length === n, expected.length, { timeout: 10000 }).catch(() => {});
  check((await p.locator("[data-testid=reel-thumb]").count()) === expected.length, "with the same results, ready to open the next one");

  console.log("\nA link to a result opened directly (shared), then Back");
  const direct = await (await b.newContext({ ...devices["iPhone 13"], baseURL: BASE })).newPage();
  await direct.goto(third.href, { waitUntil: "load" }); await settle(direct);
  await direct.getByTestId("reel-back").click();
  await direct.waitForURL((u) => u.pathname === "/explore", { timeout: 10000 });
  check(new URL(direct.url()).searchParams.get("maxPrice") === "5", "goes to those results too (not the home page)", direct.url());
  await direct.context().close();

  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
