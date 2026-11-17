// Help & support, Privacy and Terms have a back button on phones: back to where you came from, or
// to Account when the page was opened directly.
//   BASE_URL=http://localhost:3000 node e2e/legal-back.js
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const path = (p) => new URL(p.url()).pathname;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.4.4.4" } });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto("/login"); await p.fill("#email", "customer@numnum.demo"); await p.fill("#password", "demo1234");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.locator('form:has(#password) button[type=submit]').click()]);

  await p.goto("/account", { waitUntil: "load" }); await settle(p);
  await p.locator("a[href='/support']:visible").click();
  await p.waitForURL((u) => u.pathname === "/support"); await settle(p);
  const back = p.locator("[data-testid=back-button]:visible");
  check(await back.isVisible(), "Help & support has a back button");
  await back.click();
  await p.waitForURL((u) => u.pathname === "/account").catch(() => {});
  check(path(p) === "/account", "Account → Help & support → Back → Account", path(p));

  for (const u of ["/privacy", "/terms", "/support"]) {
    const q = await ctx.newPage(); // opened directly (a link from an email or the store listing)
    await q.goto(u, { waitUntil: "load" }); await settle(q);
    await q.locator("[data-testid=back-button]:visible").click();
    await q.waitForURL((x) => x.pathname !== u).catch(() => {});
    check(path(q) === "/account", `${u} opened directly → Back → Account`, path(q));
    await q.close();
  }
  check(!errors.length, "no page errors", errors);
  await b.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
