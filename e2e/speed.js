// Speed rule: every tap opens its screen at once, even on a slow phone network.
// The network gets a 400 ms delay per request, so any tap that waits for the server takes 400 ms+.
// A screen must be fully shown (no loading placeholders) within LIMIT of the tap.
//   BASE_URL=http://localhost:3000 node e2e/speed.js
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const DELAY = 400;
const LIMIT = 300;
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const section = (s) => console.log(`\n${s}`);
let ip = 30;
const shown = () => !document.querySelector('div[hidden][id^="S:"]') && !document.querySelector("div.animate-pulse.rounded-xl");

(async () => {
  const b = await chromium.launch();
  const errors = [];

  async function as(email, password) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.7.7.${ip++}` } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email} on ${p.url()}: ${String(e).slice(0, 160)}`));
    // The "How was your order?" prompt (an earlier delivered order) can appear on any page: close it.
    await p.addLocatorHandler(p.getByRole("dialog", { name: "How was your order?" }), async () => p.getByRole("button", { name: "Not now" }).click({ timeout: 3000 }).catch(() => {}));
    if (email) {
      await p.goto("/login");
      await p.fill("#email", email);
      await p.fill("#password", password);
      await p.locator("form button[type=submit]").click();
      await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    }
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: DELAY, downloadThroughput: 1.5e6, uploadThroughput: 5e5 });
    return p;
  }
  // Open a screen and give the person a moment to look at it (as anyone does before tapping).
  async function on(p, path) {
    await p.goto(path, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForFunction(shown, null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(2500);
  }
  // Tap, then time until the new screen is fully shown.
  async function tap(p, target, url, label, ready) {
    // Links further down load once scrolled to: scroll there and look for a moment, like a person.
    await target.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(1000);
    const from = p.url();
    const t = Date.now();
    const during = [];
    const log = (r) => during.push(`${Date.now() - t}ms ${r.method()} ${r.url().replace(BASE, "")}`);
    p.on("request", log);
    await target.click({ timeout: 10000 });
    if (url) await p.waitForURL((u) => u.href !== from && url.test(u.pathname + u.search), { timeout: 20000 }).catch(() => {});
    await p.waitForFunction(shown, null, { timeout: 20000, polling: 16 }).catch(() => {});
    if (ready) await ready().catch(() => {});
    const ms = Date.now() - t;
    const ok = (!url || url.test(new URL(p.url()).pathname + new URL(p.url()).search)) && ms <= LIMIT;
    p.off("request", log);
    check(ok, `${label}: ${ms} ms`, { ms, url: p.url(), requests: ok ? undefined : during.slice(0, 12) });
    await p.waitForTimeout(1500);
    return ms;
  }
  const back = (p) => p.locator("header button[aria-label=Back]:visible, [data-testid=back-button]:visible").first();
  const tab = (p, name) => p.locator("nav.fixed").getByRole("link", { name, exact: true });

  section("Customer: tabs, account, restaurant, dish popup, cart → checkout, back arrows");
  {
    const p = await as("customer@numnum.demo", "demo1234");
    await on(p, "/account");
    await tab(p, "Explore").waitFor();
    await tap(p, tab(p, "Explore"), /^\/explore/, "tab bar → Explore");
    await tap(p, tab(p, "Restaurants"), /^\/restaurants/, "tab bar → Restaurants");
    await tap(p, tab(p, "Cart"), /^\/cart/, "tab bar → Cart");
    await tap(p, tab(p, "Account"), /^\/account$/, "tab bar → Account");
    for (const [href, name] of [["/account/orders", "My orders"], ["/saved", "Saved"], ["/account/addresses", "Saved addresses"], ["/account/password", "Change password"], ["/support", "Help & support"]]) {
      await on(p, "/account");
      await tap(p, p.locator(`a[href="${href}"]:visible`).first(), new RegExp(`^${href}`), `Account → ${name}`);
      await tap(p, back(p), /^\/account$/, `${name} → back arrow`);
    }
    await on(p, "/restaurants");
    await tap(p, p.locator('a[href="/r/burger-house"]:visible').first(), /^\/r\/burger-house$/, "Restaurants → Burger House");
    await tap(p, back(p), /^\/restaurants/, "Burger House → back arrow");
    await on(p, "/r/burger-house");
    await tap(p, p.getByLabel("Add Double Smash Burger").first(), null, "dish → order popup with options", () => p.getByRole("button", { name: /Add to cart/ }).waitFor({ timeout: 5000 }));
    await p.getByRole("button", { name: /Add to cart/ }).click();
    await p.waitForTimeout(800);
    await on(p, "/cart");
    await tap(p, p.getByRole("button", { name: /Continue to checkout/ }), /^\/checkout/, "Cart → Checkout", () => p.getByText("How would you like your order?").waitFor({ timeout: 5000 }));
    await tap(p, back(p), /^\/cart/, "Checkout → back arrow");
    await p.context().close();
  }

  section("Home feed: reel → restaurant → back to the reel");
  {
    const p = await as("customer@numnum.demo", "demo1234");
    await on(p, "/");
    await p.waitForTimeout(3000); // the restaurant behind the reel loads once the reel plays
    const avatar = p.locator('[data-reel-active="true"] a[aria-label^="Open "], a[aria-label^="Open "]:visible').first();
    await tap(p, avatar, /^\/r\//, "reel → restaurant profile");
    await tap(p, back(p), /^\/$/, "restaurant → back arrow to the reel");
    await p.context().close();
  }

  section("Food creator: studio screens");
  {
    const p = await as("mrfoodies@numnum.demo", "demo1234");
    for (const [href, name] of [["/creator/new", "Post a reel"], ["/creator/profile", "Edit profile"], ["/creator/insights", "Insights"], ["/c/mr.foodies", "Public profile"]]) {
      await on(p, "/creator");
      await tap(p, p.locator(`a[href="${href}"]:visible`).first(), new RegExp(`^${href.replace(".", "\\.")}`), `Studio → ${name}`);
      await tap(p, back(p), /^\/creator$/, `${name} → back arrow`);
    }
    await on(p, "/account");
    await tap(p, p.locator('a[href="/creator"]:visible').first(), /^\/creator$/, "Account → Creator studio");
    await p.context().close();
  }

  section("Restaurant dashboard: menu");
  {
    const p = await as("owner@manousheh.demo", "demo1234");
    await on(p, "/dashboard");
    for (const [href, name] of [["/dashboard/orders", "Orders"], ["/dashboard/menu", "Menu"], ["/dashboard/reels", "Reels"], ["/dashboard/creator-reels", "Creator reels"], ["/dashboard/insights", "Insights"], ["/dashboard/settings", "Settings"], ["/dashboard", "Overview"]]) {
      await p.getByLabel("Open menu").click();
      await p.waitForTimeout(700); // reading the menu
      await tap(p, p.locator(`a[href="${href}"]:visible`).first(), new RegExp(`^${href}($|\\?)`), `Dashboard menu → ${name}`);
    }
    await p.context().close();
  }

  section("Admin: menu");
  {
    const p = await as("admin@numnum.app", "admin1234");
    await on(p, "/admin");
    for (const [href, name] of [["/admin/restaurants", "Restaurants"], ["/admin/creators", "Creators"], ["/admin/orders", "Order records"], ["/admin", "Overview"]]) {
      await p.getByLabel("Open menu").click();
      await p.waitForTimeout(700);
      await tap(p, p.locator(`a[href="${href}"]:visible`).first(), new RegExp(`^${href}($|\\?)`), `Admin menu → ${name}`);
    }
    await p.context().close();
  }

  check(!errors.length, "no page errors", errors);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
