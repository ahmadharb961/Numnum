// A restaurant owner who is also a food creator (same account) can't tag their own restaurant:
// its dishes show greyed with the reason; other restaurants' dishes can be picked.
//   BASE_URL=http://localhost:3000 node e2e/creator-own-restaurant.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };

(async () => {
  const db = new PrismaClient();
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" } });
  const handle = `bh.owner${Date.now() % 100000}`;
  await db.creator.upsert({ where: { userId: owner.id }, update: { status: "APPROVED" }, create: { userId: owner.id, handle, displayName: "Burger House Owner", status: "APPROVED", approvedAt: new Date(), searchName: handle, searchText: handle } });
  const b = await chromium.launch();
  const errors = [];
  for (const lang of ["en", "ar"]) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.8.${lang === "en" ? 1 : 2}` } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await p.goto("/login");
    await p.fill("#email", "owner@burgerhouse.demo");
    await p.fill("#password", "demo1234");
    await p.locator("form button[type=submit]").click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    if (lang === "ar") await ctx.addCookies([{ name: "nn_lang", value: "ar", url: BASE }]);
    await p.goto("/creator/new", { waitUntil: "networkidle" });
    // Own restaurant: shown, greyed, with the reason, and can't be picked.
    await p.getByTestId("dish-search").fill("Double Smash");
    const own = p.locator("[data-testid=dish-result][data-own]").first();
    await own.waitFor({ timeout: 10000 });
    const text = await own.innerText();
    check(text.includes("Burger House") && (lang === "en" ? text.includes("Your restaurant: post it from your dashboard") : text.includes("مطعمك: انشره من لوحة التحكم")), `${lang}: own restaurant's dish shows the reason`, text);
    check(await own.isDisabled(), `${lang}: and can't be picked`);
    await own.click({ force: true }).catch(() => {});
    check((await p.getByTestId("picked-dish").count()) === 0, `${lang}: tapping it picks nothing`);
    // Another restaurant: can be picked.
    await p.getByTestId("dish-search").fill("Manousheh");
    const other = p.locator("[data-testid=dish-result]:not([data-own])").first();
    await other.waitFor({ timeout: 10000 });
    await p.waitForTimeout(400);
    await p.evaluate(() => window.scrollBy(0, 300));
    await other.click();
    check(await p.getByTestId("picked-dish").waitFor({ timeout: 5000 }).then(() => true, () => false), `${lang}: another restaurant's dish can be picked`);
    await p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/creator-own-${lang}.png` });
    await ctx.close();
  }
  check(!errors.length, "no page errors", errors);
  await db.creator.deleteMany({ where: { userId: owner.id } });
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
