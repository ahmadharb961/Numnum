// Restaurants tab: category, area and "Delivers to me" filters answer instantly on the phone and
// show exactly the restaurants the database says they should.
//   BASE_URL=http://localhost:4000 node e2e/restaurants-filters.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:4000";
const db = new PrismaClient();
let fails = 0;
const check = (ok, msg, extra) => { console.log(`${ok ? "✓" : "✗"} ${msg}${ok ? "" : ` — ${JSON.stringify(extra)}`}`); if (!ok) fails++; };
const HAMRA = { lat: 33.8963, lng: 35.4823, label: "Hamra" };

(async () => {
  const restaurants = await db.restaurant.findMany({ where: { status: "ACTIVE" }, select: { id: true, displayName: true, area: true, city: true } });
  const served = await db.menuItem.findMany({ where: { archived: false, foodCategoryId: { not: null }, restaurant: { status: "ACTIVE" } }, select: { restaurantId: true, foodCategory: { select: { slug: true, name: true } } }, distinct: ["restaurantId", "foodCategoryId"] });
  const cats = await db.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const expectFor = (slug, area) => restaurants.filter((r) => (!slug || served.some((s) => s.restaurantId === r.id && s.foodCategory.slug === slug)) && (!area || [r.area, r.city].some((v) => v && v.toLowerCase().includes(area.toLowerCase())))).map((r) => r.displayName).sort();

  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  await ctx.addCookies([{ name: "nn_loc", value: encodeURIComponent(JSON.stringify(HAMRA)), url: BASE }]);
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("/restaurants", { waitUntil: "networkidle" });
  const shown = async () => (await p.locator("main a[href^='/r/'] h3, main a[href^='/r/'] [class*='font-black']").allInnerTexts()).map((s) => s.trim()).filter(Boolean);
  const names = async () => [...new Set(await p.locator("main a[href^='/r/']").evaluateAll((els) => els.map((e) => e.getAttribute("href"))))];
  const slugToName = Object.fromEntries((await db.restaurant.findMany({ select: { slug: true, displayName: true } })).map((r) => [`/r/${r.slug}`, r.displayName]));
  const visible = async () => (await names()).map((h) => slugToName[h]).sort();
  check(JSON.stringify(await visible()) === JSON.stringify(expectFor()), `"All" shows every restaurant (${expectFor().length})`, await visible());

  // Taps never go back to the server
  // (Preloading the restaurant pages that appear is expected; asking for the list again is not.)
  const requests = []; p.on("request", (r) => { if (new URL(r.url()).pathname === "/restaurants") requests.push(r.url()); });
  const tap = async (label) => { const t0 = Date.now(); await p.getByRole("button", { name: label, exact: true }).first().click(); await p.waitForTimeout(30); return Date.now() - t0; };

  const tried = cats.filter((c) => served.some((s) => s.foodCategory.slug === c.slug)).slice(0, 4).concat(cats.filter((c) => !served.some((s) => s.foodCategory.slug === c.slug)).slice(0, 1));
  for (const c of tried) {
    const ms = await tap(c.name);
    const exp = expectFor(c.slug);
    check(JSON.stringify(await visible()) === JSON.stringify(exp), `${c.name}: shows ${exp.length ? exp.join(", ") : "nobody (empty message)"} in ${ms} ms`, await visible());
    check(new URL(p.url()).searchParams.get("category") === c.slug, `${c.name}: the address bar says category=${c.slug}`, p.url());
    if (!exp.length) check(await p.getByText(/restaurants here yet/).isVisible(), `${c.name}: says no restaurants here yet`);
    check(await p.getByRole("button", { name: c.name, exact: true }).first().getAttribute("aria-pressed") === "true", `${c.name}: tile marked as chosen`);
  }
  // Area + category together, then back to all
  const area = (await db.restaurant.findFirst({ where: { status: "ACTIVE", area: { not: null } }, select: { area: true } }))?.area;
  if (area) {
    const c = tried[0];
    await tap(c.name);
    const ms = await tap(area);
    check(JSON.stringify(await visible()) === JSON.stringify(expectFor(c.slug, area)), `${area} + ${c.name}: ${expectFor(c.slug, area).length} restaurant(s) in ${ms} ms`, await visible());
    check(p.url().includes(`area=${encodeURIComponent(area).replace(/%20/g, "+")}`) || p.url().includes(`area=${encodeURIComponent(area)}`), "the address bar keeps both filters", p.url());
    await tap("All areas");
    check(JSON.stringify(await visible()) === JSON.stringify(expectFor(c.slug)), `"All areas" keeps ${c.name} and drops the area`, await visible());
  }
  await tap("All");
  check(JSON.stringify(await visible()) === JSON.stringify(expectFor()), `"All" brings everyone back`, await visible());
  // Delivers to me: only restaurants marked "Delivers to you"
  await tap("Delivers to me");
  const cards = await p.locator("main a[href^='/r/']").allInnerTexts();
  check(cards.length > 0 && cards.every((t) => /Delivers to you/.test(t)), `"Delivers to me": ${cards.length} restaurant(s), all deliver here`, cards.map((t) => t.split("\n")[0]));
  await tap("Delivers to me");
  check(requests.length === 0, "no trip to the server for any of these taps (the list is never fetched again)", requests.slice(0, 5));

  // A shared link opens the same view (server-rendered)
  const c = tried[0];
  const q = await ctx.newPage();
  await q.goto(`/restaurants?category=${c.slug}`, { waitUntil: "networkidle" });
  const deep = (await q.locator("main a[href^='/r/']").evaluateAll((els) => els.map((e) => e.getAttribute("href")))).map((h) => slugToName[h]).sort();
  check(JSON.stringify([...new Set(deep)]) === JSON.stringify(expectFor(c.slug)), `link /restaurants?category=${c.slug} opens filtered`, deep);
  const html = await (await ctx.request.get(`/restaurants?category=${c.slug}`)).text();
  check(expectFor(c.slug).every((n) => html.includes(n)) && expectFor().filter((n) => !expectFor(c.slug).includes(n)).every((n) => !html.includes(`>${n}<`)), "and the server sends that filtered list in the first HTML", "");
  check(!errors.length, "no page errors", errors);

  await b.close(); await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
