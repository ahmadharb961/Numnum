// The restaurant dashboard on a phone feels like the customer app: a tab bar (Home, Orders with the
// live count, Menu, Reels, More), a slim top bar with the sound switch, back buttons on inner pages,
// nothing hidden behind the tab bar. On a computer: the sidebar, no tab bar.
//   BASE_URL=http://localhost:3000 node e2e/dashboard-phone.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const path = (p) => new URL(p.url()).pathname;

async function login(ctx, email) {
  const p = await ctx.newPage();
  await p.goto("/login"); await p.fill("#email", email); await p.fill("#password", "demo1234");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.locator('form:has(#password) button[type=submit]').click()]);
  return p;
}

(async () => {
  const db = new PrismaClient();
  const r = await db.restaurant.findUnique({ where: { slug: "burger-house" } });
  const pending = await db.order.count({ where: { restaurantId: r.id, status: "PLACED" } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.5.5.5" } });
  const p = await login(ctx, "owner@burgerhouse.demo");
  const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto("/dashboard", { waitUntil: "load" }); await settle(p);
  const tabs = p.getByTestId("dash-tabs");

  console.log("\nTab bar");
  check(await tabs.isVisible(), "a tab bar at the bottom");
  check((await tabs.locator("li").allInnerTexts()).map((s) => s.replace(/\d+/g, "").trim()).join(",") === "Home,Orders,Menu,Reels,More", "Home · Orders · Menu · Reels · More", await tabs.locator("li").allInnerTexts());
  if (pending) check((await p.getByTestId("orders-badge").innerText()) === String(pending), `Orders shows the ${pending} new order(s)`, await p.getByTestId("orders-badge").innerText().catch(() => null));
  for (const [label, url] of [["Orders", "/dashboard/orders"], ["Menu", "/dashboard/menu"], ["Reels", "/dashboard/reels"], ["Home", "/dashboard"]]) {
    const t0 = Date.now();
    await tabs.getByRole("link", { name: label }).click();
    await p.waitForURL((u) => u.pathname === url);
    const ms = Date.now() - t0;
    check((await tabs.getByRole("link", { name: label }).getAttribute("aria-current")) === "page", `${label}: one tap, highlighted (${ms} ms)`);
  }

  console.log("\nMore");
  await p.getByTestId("dash-more").click();
  const drawer = p.locator(".fixed.inset-0 nav");
  check(await drawer.isVisible(), "More opens the full menu");
  await p.locator(".fixed.inset-0 a[href='/dashboard/settings']").click();
  await p.waitForURL((u) => u.pathname === "/dashboard/settings"); await settle(p);
  check(!(await drawer.isVisible().catch(() => false)), "picking a page closes it");
  check((await p.getByTestId("dash-more").getAttribute("class")).includes("text-brand-600"), "More is highlighted on pages it holds");

  console.log("\nTop bar");
  const sound = p.getByTestId("sound-toggle");
  check(await sound.isVisible(), "the sound switch is in the top bar (no extra row)");
  const before = await sound.getAttribute("aria-pressed");
  await sound.click();
  check((await sound.getAttribute("aria-pressed")) !== before, "and it switches");
  if (before === "false") await sound.click(); // leave it as it was

  console.log("\nInner pages have a way back");
  await tabs.getByRole("link", { name: "Menu" }).click();
  await p.waitForURL((u) => u.pathname === "/dashboard/menu"); await settle(p);
  await p.locator("a[href^='/dashboard/menu/items/']:visible").first().click();
  await p.waitForURL(/\/dashboard\/menu\/items\//); await settle(p);
  await p.locator("[data-testid=back-button]:visible").click();
  await p.waitForURL((u) => u.pathname === "/dashboard/menu");
  check(true, "menu item → Back → Menu");
  const inv = await db.invoice.findFirst({ where: { restaurantId: r.id } });
  if (inv) {
    const q = await ctx.newPage(); // opened directly (e.g. from a notification): Back goes to Billing
    await q.goto(`/dashboard/billing/${inv.id}`, { waitUntil: "load" }); await settle(q);
    await q.locator("[data-testid=back-button]:visible").click();
    await q.waitForURL((u) => u.pathname === "/dashboard/billing").catch(() => {});
    check(path(q) === "/dashboard/billing", "an invoice opened directly → Back → Billing", path(q));
    await q.close();
  }

  console.log("\nNothing hidden or cut off");
  const pages = ["/dashboard", "/dashboard/orders", "/dashboard/insights", "/dashboard/menu", "/dashboard/reels", "/dashboard/deals", "/dashboard/reviews", "/dashboard/billing", "/dashboard/settings", "/dashboard/staff", "/dashboard/notifications"];
  const bad = [];
  for (const u of pages) {
    await p.goto(u, { waitUntil: "load" }); await settle(p); await p.waitForTimeout(300);
    const r2 = await p.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const bar = document.querySelector("[data-testid=dash-tabs]").getBoundingClientRect().top;
      // Where the page's own content ends (its container minus its bottom padding), scrolled to the end.
      const page = [...document.querySelectorAll(".max-w-6xl")].filter((e) => e.offsetParent).pop();
      const end = page ? page.getBoundingClientRect().bottom - parseFloat(getComputedStyle(page).paddingBottom) : 0;
      return { wide: document.documentElement.scrollWidth > innerWidth + 1, covered: end > bar + 1 };
    });
    if (r2.wide || r2.covered) bad.push({ u, ...r2 });
  }
  check(!bad.length, `no sideways scrolling and nothing behind the tab bar on ${pages.length} pages`, bad);

  console.log("\nComputer");
  const desk = await b.newContext({ viewport: { width: 1280, height: 800 }, baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.5.5.6" } });
  const d = await login(desk, "owner@burgerhouse.demo");
  await d.goto("/dashboard", { waitUntil: "load" }); await settle(d);
  check(!(await d.getByTestId("dash-tabs").isVisible()), "no tab bar on a computer");
  check(await d.locator("aside").isVisible(), "the sidebar is there");
  check(await d.getByRole("button", { name: /Turn on sound|Sound on|Tap to enable sound/ }).isVisible(), "new orders and sound above the page");

  console.log("\nArabic");
  await ctx.addCookies([{ name: "nn_lang", value: "ar", url: BASE }]);
  await p.goto("/dashboard", { waitUntil: "load" }); await settle(p);
  const ar = await tabs.locator("li").allInnerTexts();
  check(ar.some((s) => s.includes("الطلبات")) && (await p.evaluate(() => document.documentElement.dir)) === "rtl", "tabs in Arabic, right-to-left", ar);
  check(!errors.length, "no page errors", errors);
  await b.close(); await db.$disconnect();
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
