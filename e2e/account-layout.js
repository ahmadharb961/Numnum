// Account page layout on a phone, for every kind of user: hero, language, tiles that fit the screen.
//   BASE_URL=http://localhost:3000 node e2e/account-layout.js
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
let ip = 40;
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const users = [["customer", "customer@numnum.demo", "demo1234", 8, "en"], ["creator", "mrfoodies@numnum.demo", "demo1234", 8, "en"], ["restaurant", "owner@manousheh.demo", "demo1234", 9, "en"], ["admin", "admin@numnum.app", "admin1234", null, "en"], ["customer", "customer@numnum.demo", "demo1234", 8, "ar"]];
  for (const device of ["iPhone SE", "iPhone 13"]) for (const [who, email, pw, n, lang] of users) {
    const ctx = await b.newContext({ ...devices[device], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.6.6.${ip++}` } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${who} ${p.url()}: ${String(e).slice(0, 140)}`));
    await p.addLocatorHandler(p.getByRole("dialog", { name: /How was your order\?|كيف كان طلبك/ }), async () => p.getByRole("button", { name: /^(Not now|ليس الآن)$/ }).click({ timeout: 3000 }).catch(() => {}));
    await p.goto("/login"); await p.fill("#email", email); await p.fill("#password", pw);
    await p.locator("form button[type=submit]").click(); await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    if (lang === "ar") await ctx.addCookies([{ name: "nn_lang", value: "ar", url: BASE }]);
    await p.goto("/account", { waitUntil: "networkidle" });
    const label = `${device} ${who} ${lang}`;
    check(await p.getByTestId("account-hero").isVisible(), `${label}: orange header with the greeting`, null);
    const tiles = p.locator("[data-testid=account-tiles] > a");
    const count = await tiles.count();
    if (n) check(count === n, `${label}: ${n} tiles`, count); else check(count >= 9, `${label}: tiles incl. admin`, count);
    const vw = p.viewportSize().width;
    const fit = await p.evaluate((vw) => { const out = []; document.querySelectorAll("[data-testid=account-tiles] > a").forEach((a) => { const r = a.getBoundingClientRect(); if (r.left < 0 || r.right > vw + 0.5 || a.scrollWidth > a.clientWidth + 1) out.push(a.textContent); }); return { out, page: document.documentElement.scrollWidth }; }, vw);
    check(!fit.out.length && fit.page <= vw, `${label}: every tile fits, no sideways scroll`, fit);
    // Rows line up: tiles in the same row have the same height.
    const rows = await p.evaluate(() => { const m = {}; document.querySelectorAll("[data-testid=account-tiles] > a").forEach((a) => { const r = a.getBoundingClientRect(); (m[Math.round(r.top)] ??= new Set()).add(Math.round(r.height)); }); return Object.values(m).map((s) => s.size); });
    check(rows.every((x) => x === 1), `${label}: tiles in a row are the same height`, rows);
    await p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/account-${device.replace(/ /g, "")}-${who}-${lang}.png`, fullPage: true });
    // A tile opens its screen.
    await tiles.filter({ has: p.locator('[href="/account/password"]') }).count();
    await p.locator('[data-testid=account-tiles] a[href="/account/password"]').click();
    await p.waitForURL(/\/account\/password/);
    check(true, `${label}: tile opens its screen`);
    await ctx.close();
  }
  check(!errors.length, "no page errors", errors);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
