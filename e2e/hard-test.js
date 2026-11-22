// Pre-launch hard test, looking for anything that crashes:
//  A. Crawls the whole app as each kind of person (guest, customer, food creator, restaurant owner,
//     admin; English and Arabic), following every link it finds: server errors, broken links,
//     crash screens, page errors, console errors.
//  B. Throws junk at every API (bad JSON, wrong types, huge bodies, no login): never a 5xx.
//  C. Load: hundreds of requests at once to the busiest pages and APIs.
//  D. Orders under pressure: the same order sent 20 times at once makes ONE order; 15 different
//     orders at once all succeed.
//  E. Access: guests and customers can't reach restaurant/admin data; a restaurant can't open
//     another restaurant's order.
//   BASE_URL=http://localhost:3000 node e2e/hard-test.js
const { chromium, devices, request: pwRequest } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = new PrismaClient();
const problems = [];
let fails = 0;
const flag = (where, what) => problems.push(`${where} — ${what}`);
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x).slice(0, 600)}`); if (!c) fails++; };
let ipN = 1;
const ip = () => `10.${9}.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
// The sandbox has no internet: map tiles, video hosting and fonts from outside can't load. Not app errors.
const EXTERNAL = /openstreetmap|cartocdn|tile|videodelivery|cloudflarestream|googleapis|gstatic|fonts\.|wa\.me|instagram|tiktok|facebook|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TUNNEL|net::ERR_FAILED|ERR_ABORTED|Failed to load resource: net::/i;

async function newCtx(b, { email, password = "demo1234", lang = "en", desktop = false } = {}) {
  const ctx = await b.newContext({ ...(desktop ? { viewport: { width: 1360, height: 900 } } : devices["iPhone 13"]), baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
  if (email) {
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.fill("#email", email);
    await p.fill("#password", password);
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), p.locator("form button[type=submit]").click()]);
    await p.close();
  }
  return ctx;
}

// ───────────────────────── A. Crawl ─────────────────────────
// Links never followed: they log out, change state on open, download files, or leave the app.
const SKIP = /^\/(logout|api\/|m\/|verify-email|unsubscribe|_next)|\/(exit-restaurant|switch)(\/|$)|\.(csv|pdf|jpg|png|webp)$/;
async function crawl(b, label, opts, seeds, max) {
  const ctx = await newCtx(b, opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`page error: ${String(e).slice(0, 220)}`));
  page.on("console", (m) => { if (m.type() === "error" && !EXTERNAL.test(m.text())) errs.push(`console: ${m.text().slice(0, 220)}`); });
  page.on("response", (r) => { const u = new URL(r.url()); if (u.origin === new URL(BASE).origin && r.status() >= 500) errs.push(`${r.status()} from ${u.pathname}${u.search}`); });
  const seen = new Set();
  const perPath = new Map();
  const queue = seeds.map((s) => ({ url: s, from: "start" }));
  let visited = 0;
  while (queue.length && visited < max) {
    const { url, from } = queue.shift();
    const u = new URL(url, BASE);
    const key = u.pathname + u.search;
    if (seen.has(key)) continue;
    // Many versions of the same screen (search queries, ids): a few are enough.
    const shape = u.pathname.replace(/\/[a-z0-9]{20,}/gi, "/:id");
    if ((perPath.get(shape) ?? 0) >= 3) continue;
    perPath.set(shape, (perPath.get(shape) ?? 0) + 1);
    seen.add(key);
    visited++;
    errs.length = 0;
    let status = 0;
    try {
      const res = await page.goto(key, { waitUntil: "load", timeout: 45000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(700); // hydration and first effects
    } catch (e) {
      flag(`${label} ${key}`, `didn't load: ${String(e).split("\n")[0].slice(0, 160)}`);
      continue;
    }
    const text = await page.locator("body").innerText().catch(() => "");
    if (status >= 500) flag(`${label} ${key}`, `HTTP ${status}`);
    if (/Application error|client-side exception|Internal Server Error|This page couldn.t load/i.test(text)) flag(`${label} ${key}`, "crash screen");
    if (/(^|\n)\s*404\s*(\n|$)|Page not found|This page could not be found/i.test(text) && from !== "start") flag(`${label} ${key}`, `broken link (from ${from})`);
    for (const e of new Set(errs)) flag(`${label} ${key}`, e);
    const links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
    for (const h of links) {
      if (!h || !h.startsWith("/") || h.startsWith("//")) continue;
      const n = new URL(h, BASE);
      if (SKIP.test(n.pathname)) continue;
      const k = n.pathname + n.search;
      if (!seen.has(k)) queue.push({ url: k, from: key });
    }
  }
  await ctx.close();
  return visited;
}

// ───────────────────────── B. API junk ─────────────────────────
function apiRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") {
        const src = fs.readFileSync(p, "utf8");
        const methods = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
        out.push({ route: p.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""), methods });
      }
    }
  };
  walk("src/app/api");
  return out;
}

(async () => {
  const b = await chromium.launch();
  const t0 = Date.now();
  const any = async (fn) => fn().catch(() => null);
  const order = await db.order.findFirst({ where: { restaurant: { slug: "burger-house" } }, orderBy: { createdAt: "desc" }, select: { reference: true, id: true, customerName: true } });
  const reel = await db.reel.findFirst({ where: { visibility: "PUBLISHED", status: "READY" }, orderBy: { viewCount: "desc" }, select: { id: true } });
  const item = await db.menuItem.findFirst({ where: { archived: false, restaurant: { slug: "burger-house" } }, select: { id: true } });
  const bh = await db.restaurant.findFirstOrThrow({ where: { slug: "burger-house" } });
  const invoice = await db.invoice.findFirst({ where: { restaurantId: bh.id }, select: { id: true } });

  console.log("\nA. Crawl every screen, as every kind of person");
  const ROLES = [
    ["guest · en", {}, ["/", "/explore", "/explore?type=reels", "/explore?type=restaurants", "/explore?type=creators", "/restaurants", "/offers", "/business", "/login", "/account/register", "/c/mr.foodies", "/r/burger-house", reel && `/reel/${reel.id}`, "/privacy", "/terms"], 140],
    ["guest · ar", { lang: "ar" }, ["/", "/explore", "/restaurants", "/offers", "/r/manousheh-corner", "/c/mr.foodies"], 60],
    ["customer · en", { email: "customer@numnum.demo" }, ["/account", "/account/orders", "/account/notifications", "/account/following", "/saved", "/cart", "/checkout", "/explore", "/offers", "/creator/apply"], 120],
    ["customer · ar", { email: "customer@numnum.demo", lang: "ar" }, ["/account", "/account/orders", "/cart", "/offers"], 50],
    ["creator · en", { email: "mrfoodies@numnum.demo" }, ["/creator", "/creator/insights", "/creator/restaurants", "/creator/new", "/creator/profile", "/creator/followers", "/c/mr.foodies", "/c/mr.foodies/results"], 80],
    ["owner · en", { email: "owner@burgerhouse.demo", desktop: true }, ["/dashboard", "/dashboard/orders", "/dashboard/customers", "/dashboard/find-creators", "/dashboard/insights", "/dashboard/menu", "/dashboard/reels", "/dashboard/creator-reels", "/dashboard/deals", "/dashboard/reviews", "/dashboard/billing", "/dashboard/settings", "/dashboard/staff", "/dashboard/verification", "/dashboard/notifications"], 140],
    ["owner · ar", { email: "owner@burgerhouse.demo", lang: "ar", desktop: true }, ["/dashboard", "/dashboard/orders", "/dashboard/customers", "/dashboard/billing"], 40],
    ["admin", { email: process.env.ADMIN_EMAIL || "admin@numnum.app", password: process.env.ADMIN_PASSWORD || "admin1234", desktop: true }, ["/admin", "/admin/restaurants", "/admin/customers", "/admin/creators", "/admin/orders", "/admin/commissions", "/admin/invoices", "/admin/payments", "/admin/disputes", "/admin/moderation", "/admin/categories", "/admin/settings", "/admin/audit", "/admin/push", "/admin/notifications", "/admin/verifications"], 160],
  ];
  let total = 0;
  for (const [label, opts, seeds, max] of ROLES) {
    const before = problems.length;
    const n = await crawl(b, label, opts, seeds.filter(Boolean), max).catch((e) => { flag(label, `crawl stopped: ${String(e).slice(0, 200)}`); return 0; });
    total += n;
    console.log(`  ${label}: ${n} screens, ${problems.length - before} problems`);
  }
  check(problems.length === 0, `${total} screens opened with no server error, crash, broken link or page error`, problems.slice(0, 40));
  const crawlProblems = problems.length;

  console.log("\nB. Junk sent to every API");
  const guest = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const custCtx = await newCtx(b, { email: "customer@numnum.demo" });
  const cust = custCtx.request;
  const ids = { code: "zzzzzzzz", ref: order?.reference ?? "NN-XXXX", id: "doesnotexist12345" };
  const bodies = [
    ["no body", undefined],
    ["broken JSON", { raw: "{not json" }],
    ["wrong types", { data: { restaurantId: 12, items: "x", name: ["a"], lines: { a: 1 }, action: 5, platform: null, id: {}, q: [] } }],
    ["array", { data: [1, 2, 3] }],
    ["huge", { data: { name: "x".repeat(300_000) } }],
  ];
  let calls = 0;
  const bad = [];
  for (const { route, methods } of apiRoutes()) {
    if (route === "/api/cron") continue; // needs its secret; checked below
    const url = route.replace(/\[code\]/, ids.code).replace(/\[ref\]/, ids.ref).replace(/\[id\]/, ids.id);
    for (const m of methods) {
      for (const who of [["guest", guest], ["customer", cust]]) {
        for (const [what, body] of m === "GET" || m === "DELETE" ? [["plain", undefined], ["odd query", undefined]] : bodies) {
          const target = what === "odd query" ? `${url}?q=${"%27%22<>".repeat(20)}&page=-5&days=abc&from=2026-99-99&limit=999999` : url;
          const opts = { method: m, failOnStatusCode: false, timeout: 30000, headers: { "x-forwarded-for": ip(), "content-type": "application/json" } };
          if (body?.raw) opts.data = body.raw;
          else if (body?.data !== undefined) opts.data = JSON.stringify(body.data);
          const r = await who[1].fetch(target, opts).catch((e) => ({ status: () => 0, err: String(e) }));
          calls++;
          if (r.status() >= 500 || r.status() === 0) bad.push(`${m} ${target.slice(0, 80)} as ${who[0]} (${what}): ${r.status()}${r.err ? " " + r.err.slice(0, 80) : ""}`);
        }
      }
    }
  }
  const cron = await guest.fetch("/api/cron", { failOnStatusCode: false });
  check(cron.status() === 401 || cron.status() === 403 || cron.status() === 404, "the cron job can't be triggered without its secret", cron.status());
  check(bad.length === 0, `${calls} junk API calls: none crashed the server (no 5xx)`, bad.slice(0, 30));

  console.log("\nC. Load");
  const urls = ["/", "/explore", "/explore?type=reels&minPrice=3&maxPrice=5", "/restaurants", "/offers", "/r/burger-house", "/c/mr.foodies", reel && `/reel/${reel.id}`, "/api/feed", "/api/search?q=burger", "/api/search?q=shawarma&type=reels", item && `/api/items/${item.id}`].filter(Boolean);
  const N = 400, CONC = 40;
  const times = [];
  const statuses = {};
  let next = 0;
  const startLoad = Date.now();
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < N) {
      const u = urls[next++ % urls.length];
      const s = Date.now();
      const r = await fetch(BASE + u, { headers: { "x-forwarded-for": ip() } }).catch(() => null);
      await r?.arrayBuffer().catch(() => {});
      times.push(Date.now() - s);
      statuses[r?.status ?? 0] = (statuses[r?.status ?? 0] ?? 0) + 1;
    }
  }));
  times.sort((a, z) => a - z);
  const p = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
  const errors5 = Object.entries(statuses).filter(([s]) => Number(s) >= 500 || s === "0").reduce((n, [, c]) => n + c, 0);
  console.log(`  ${N} requests, ${CONC} at a time, in ${((Date.now() - startLoad) / 1000).toFixed(1)}s · statuses ${JSON.stringify(statuses)} · p50 ${p(0.5)}ms · p95 ${p(0.95)}ms · max ${times[times.length - 1]}ms`);
  check(errors5 === 0, `${N} requests at ${CONC} at a time: no server errors`, statuses);
  check(p(0.95) < 8000, "95% answered in under 8 s on this small test machine", p(0.95));

  console.log("\nD. Orders under pressure");
  const simple = (await db.$queryRaw`SELECT m.id FROM menu_items m JOIN restaurants r ON r.id = m."restaurantId" WHERE r.slug = 'burger-house' AND m.archived = false AND m.available = true AND NOT EXISTS (SELECT 1 FROM menu_item_customization_groups mg JOIN customization_groups g ON g.id = mg."groupId" WHERE mg."menuItemId" = m.id AND g.required = true) LIMIT 1`)[0];
  const payload = (key) => ({ idempotencyKey: key, restaurantId: bh.id, fulfillment: "PICKUP", items: [{ menuItemId: simple.id, quantity: 1, selections: {} }], customer: { name: "Load Test", phone: "70 123 456" } });
  const key = `hard-same-${Date.now()}-xxxxxxxxxxxxxxxx`;
  const beforeCount = await db.order.count({ where: { idempotencyKey: key } });
  const same = await Promise.all(Array.from({ length: 20 }, () => cust.fetch("/api/orders", { method: "POST", data: JSON.stringify(payload(key)), headers: { "content-type": "application/json" }, failOnStatusCode: false }).then(async (r) => ({ s: r.status(), j: await r.json().catch(() => null) }))));
  const refs = new Set(same.filter((x) => x.j?.reference).map((x) => x.j.reference));
  check(same.every((x) => x.s < 500), "the same order sent 20 times at once: no server error", same.map((x) => x.s));
  check((await db.order.count({ where: { idempotencyKey: key } })) - beforeCount === 1 && refs.size === 1, "and exactly ONE order is created (every tap gets the same order)", { orders: await db.order.count({ where: { idempotencyKey: key } }), refs: [...refs] });
  const diff = await Promise.all(Array.from({ length: 15 }, (_, i) => cust.fetch("/api/orders", { method: "POST", data: JSON.stringify(payload(`hard-diff-${Date.now()}-${i}-xxxxxxxxxxxx`)), headers: { "content-type": "application/json" }, failOnStatusCode: false }).then((r) => r.status())));
  const okOrRateLimited = diff.every((s) => s < 300 || s === 429);
  check(diff.every((s) => s < 500) && okOrRateLimited, "15 different orders at once: all placed (or politely rate-limited), none crashed", diff);
  await db.order.deleteMany({ where: { OR: [{ idempotencyKey: key }, { idempotencyKey: { startsWith: "hard-diff-" } }] } });

  console.log("\nE. Access");
  const guestTries = ["/api/dashboard/customers", "/api/dashboard/new-orders", "/api/dashboard/insights/orders", "/api/admin/export?type=invoices", invoice && `/api/invoices/${invoice.id}/pdf`, "/api/account/checkout-profile"].filter(Boolean);
  for (const u of guestTries) {
    const g = await guest.fetch(u, { failOnStatusCode: false });
    const c = await cust.fetch(u, { failOnStatusCode: false });
    const gBody = await g.text();
    const cBody = await c.text();
    const leaks = (s, body) => s === 200 && /reference|customerPhone|Total spent|invoice|"phone"/i.test(body) && !/^\s*\{"profile":null/.test(body);
    if (u === "/api/account/checkout-profile") check(!leaks(g.status(), gBody), `guest gets no account data from ${u}`, [g.status(), gBody.slice(0, 120)]);
    else check(!leaks(g.status(), gBody) && !leaks(c.status(), cBody), `guests and customers can't read ${u}`, [g.status(), c.status(), cBody.slice(0, 120)]);
  }
  const other = await newCtx(b, { email: "owner@shawarma.demo", desktop: true });
  const op = await other.newPage();
  await op.goto(`/dashboard/orders?ref=${order.reference}&gate=off`, { waitUntil: "load" });
  await op.waitForTimeout(800);
  check(!(await op.locator("body").innerText()).includes(order.reference), "a restaurant can't open another restaurant's order (Shawarma Station → a Burger House order)");
  const st = await other.request.fetch(`/api/orders/${order.reference}/status`, { failOnStatusCode: false });
  check(!(st.status() === 200 && (await st.text()).includes(order.customerName)), "nor read it through the API", st.status());
  const adminTry = await op.goto("/admin", { waitUntil: "load" }).then((r) => r?.status());
  check(!/(Platform overview)/.test(await op.locator("body").innerText()), "a restaurant owner can't open the admin panel", adminTry);

  console.log("\nF. Server log");
  const log = fs.existsSync("/tmp/claude-0/server.log") ? fs.readFileSync("/tmp/claude-0/server.log", "utf8").split("\n").slice(-4000) : [];
  const serverErrors = log.filter((l) => /(Error|Unhandled|TypeError|ReferenceError|prisma:error)/.test(l) && !/p256dh|push failed|ECONNREFUSED .*(stream|cloudflare)|fetch failed|getaddrinfo|ENOTFOUND|Too many requests|Invalid request|ZodError/i.test(l));
  check(serverErrors.length === 0, "no unexpected errors in the server log during all of this", serverErrors.slice(0, 20));

  await custCtx.close();
  await other.close();
  await guest.dispose();
  await b.close();
  await db.$disconnect();
  console.log(`\nTook ${Math.round((Date.now() - t0) / 1000)}s`);
  if (problems.length > crawlProblems) console.log(problems.slice(crawlProblems).join("\n"));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
