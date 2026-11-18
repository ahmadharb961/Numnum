// Creator studio → "Restaurants to shoot": every restaurant a creator can film and tag, searchable,
// with "See the menu" and "Post a reel here" (the dish search opens on that restaurant).
//   BASE_URL=http://localhost:3000 node e2e/creator-restaurants.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
let ip = 60;

(async () => {
  const db = new PrismaClient();
  const b = await chromium.launch();
  const errors = [];
  async function as(email, lang) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.6.${ip++}` } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email}: ${String(e).slice(0, 160)}`));
    await p.goto("/login");
    await p.fill("#email", email);
    await p.fill("#password", "demo1234");
    await p.locator("form button[type=submit]").click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    if (lang) await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
    return p;
  }
  const cards = (p) => p.locator("[data-testid=shoot-restaurant]:visible");
  const active = await db.restaurant.count({ where: { status: "ACTIVE", menuItems: { some: { archived: false } } } });

  console.log("\nMr. Foodies (creator)");
  {
    const p = await as("mrfoodies@numnum.demo");
    await p.goto("/creator", { waitUntil: "load" }); await settle(p);
    await p.getByTestId("shoot-restaurants-link").click();
    await p.waitForURL(/\/creator\/restaurants$/); await settle(p);
    await cards(p).first().waitFor();
    check((await cards(p).count()) === active, `lists every restaurant on numnum with a menu (${active})`, await cards(p).count());
    const first = await cards(p).first().innerText();
    check(/dish/.test(first) && /(creator reel|Be the first creator here)/.test(first), "each shows its dishes and creator reels", first);
    await p.getByTestId("shoot-search").fill("Manou");
    check((await cards(p).count()) === 1 && (await cards(p).first().innerText()).includes("Manousheh"), "search by name narrows it down", await cards(p).allInnerTexts());
    await p.getByTestId("shoot-search").fill("zzzz");
    check((await p.getByText("No restaurants found").count()) === 1, "nothing found → a clear message");
    await p.getByTestId("shoot-search").fill("");
    const area = (await db.restaurant.findFirst({ where: { status: "ACTIVE", area: { not: null } }, select: { area: true } })).area;
    await p.getByRole("button", { name: area, exact: true }).click();
    const inArea = await db.restaurant.count({ where: { status: "ACTIVE", area, menuItems: { some: { archived: false } } } });
    check((await cards(p).count()) === inArea, `area filter (${area}: ${inArea})`, await cards(p).count());
    await p.getByRole("button", { name: "All areas" }).click();
    // See the menu → the restaurant's page; back returns to the list.
    await p.getByTestId("shoot-search").fill("Burger House");
    await cards(p).first().getByTestId("shoot-menu").click();
    await p.waitForURL(/\/r\/burger-house/); await settle(p);
    check(true, "'See the menu' opens the restaurant");
    await p.locator("header button[aria-label=Back]:visible, [data-testid=back-button]:visible").first().click();
    await p.waitForURL(/\/creator\/restaurants/);
    check(true, "back returns to the list");
    // Post a reel here → composer with the dish search on that restaurant.
    await p.getByTestId("shoot-search").fill("Burger House");
    await cards(p).first().getByTestId("shoot-post").click();
    await p.waitForURL(/\/creator\/new\?q=/); await settle(p);
    check((await p.getByTestId("dish-search").inputValue()) === "Burger House", "'Post a reel here' opens the composer searching that restaurant", await p.getByTestId("dish-search").inputValue());
    await p.getByTestId("dish-result").first().waitFor({ timeout: 10000 });
    const results = await p.getByTestId("dish-result").allInnerTexts();
    check(results.length > 0 && results.every((r) => r.includes("Burger House")), "and shows its dishes", results.slice(0, 3));
    // The hint in the dish search leads to the list.
    await p.getByTestId("see-restaurants").click();
    await p.waitForURL(/\/creator\/restaurants$/);
    check(true, "'Only restaurants on numnum can be tagged. See them' opens the list");
    await p.context().close();
  }

  console.log("\nA restaurant owner who is also a creator");
  {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" } });
    await db.creator.upsert({ where: { userId: owner.id }, update: { status: "APPROVED" }, create: { userId: owner.id, handle: `bh.e2e${Date.now() % 100000}`, displayName: "BH Owner", status: "APPROVED", approvedAt: new Date(), searchName: "bh", searchText: "bh" } });
    const p = await as("owner@burgerhouse.demo", "ar");
    await p.goto("/creator/restaurants", { waitUntil: "load" }); await settle(p);
    await cards(p).first().waitFor();
    const names = await cards(p).allInnerTexts();
    check(!names.some((n) => n.includes("Burger House")) && names.length === active - 1, "their own restaurant isn't listed", { count: names.length });
    check((await p.locator("h1").first().innerText()).includes("مطاعم للتصوير") && names.some((n) => /طبق|أطباق/.test(n)), "Arabic", (await p.locator("h1").first().innerText()));
    await p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/creator-restaurants-ar.png` });
    await db.creator.deleteMany({ where: { userId: owner.id } });
    await p.context().close();
  }

  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
