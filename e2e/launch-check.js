// Pre-launch sweep: opens every screen of the app as a guest, a customer, a restaurant owner
// and an admin, in English and Arabic, on phone and desktop, and checks each one for:
//   - crashes (page errors), console errors, server errors (5xx) and broken requests (4xx)
//   - broken images, pages wider than the phone screen
//   - Arabic pages: right-to-left, and no English interface text left over
// Then checks access control: nobody can open screens or data that aren't theirs.
// Needs a running, demo-seeded server:  BASE_URL=http://localhost:3000 node e2e/launch-check.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || require("os").tmpdir();
const db = new PrismaClient();
const problems = [];
let pages = 0;
const flag = (where, what) => problems.push(`${where} — ${what}`);

async function login(ctx, email, pw) {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.getByRole("button", { name: "Log in" }).click()]);
  await page.close();
}

async function setLang(ctx, lang) {
  await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
}

// Text that legitimately stays in Latin letters on Arabic pages: data typed by restaurants and
// customers (dish/restaurant names, descriptions, reviews, addresses), brand names, codes.
let dataText = "";
const ALLOW = /^(numnum|num num|whatsapp|instagram|tiktok|facebook|google maps|apple|android|iphone|safari|chrome|samsung internet|firefox|pdf|csv|usd|lbp|ios|ok|whish|omt)$/i;

async function englishLeftovers(page) {
  const texts = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest("script,style,noscript,[aria-hidden=true],.font-mono,.tabular,[dir=ltr],input,textarea")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const t = n.textContent.replace(/\s+/g, " ").trim();
      if (/[A-Za-z]{3,}(\s+[A-Za-z']{2,})+/.test(t) || /^[A-Z][a-z]{3,}$/.test(t)) out.push(t);
    }
    // attributes people see or hear
    for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) {
      for (const a of ["placeholder", "aria-label", "title"]) {
        const v = el.getAttribute(a);
        if (v && /[A-Za-z]{3,}(\s+[A-Za-z']{2,})+/.test(v)) out.push(`@${a}: ${v}`);
      }
    }
    return out;
  });
  return [...new Set(texts)].filter((t) => {
    const bare = t.replace(/^@\w[\w-]*: /, "");
    if (ALLOW.test(bare)) return false;
    if (/[؀-ۿ]/.test(bare) && !/[A-Za-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}/.test(bare)) return false; // mixed Arabic sentence with a name in it
    const words = bare.match(/[A-Za-z][A-Za-z']+/g) || [];
    const latin = words.join(" ").toLowerCase();
    return latin.length && !dataText.includes(latin) && !words.every((w) => dataText.includes(w.toLowerCase()) || ALLOW.test(w));
  });
}

async function visit(ctx, label, path, opts = {}) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`crash: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // reported via the response listener with the URL
    errs.push(`console: ${t.slice(0, 160)}`);
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BASE).origin) return;
    if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) return; // the page itself: checked below
    if (r.status() >= 500) errs.push(`${r.status()} ${u.pathname}`);
    else if (r.status() >= 400 && !(opts.allow4xx || []).some((p) => u.pathname.startsWith(p))) errs.push(`${r.status()} ${u.pathname}`);
  });
  const where = `[${label}] ${path}`;
  let res;
  try {
    res = await page.goto(path, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    flag(where, `did not load: ${e.message.split("\n")[0]}`);
    await page.close();
    return null;
  }
  pages++;
  await page.waitForTimeout(300);
  const final = new URL(page.url()).pathname;
  if (opts.expectRedirect) {
    if (!opts.expectRedirect.test(final)) flag(where, `expected redirect to ${opts.expectRedirect}, ended at ${final}`);
  } else {
    if (res && res.status() >= 400 && !opts.expectStatus) flag(where, `HTTP ${res.status()}`);
    if (opts.expectStatus === 404 && res && res.status() !== 404) {
      // Pages that stream (with a loading screen) can't change the status code once sending has
      // started: Next.js then shows the not-found screen with a noindex tag instead.
      const ok = await page.evaluate(() => /noindex/.test(document.querySelector('meta[name=robots]')?.content || "") && /This plate is empty|هذا الصحن فارغ|couldn't open this order|لم نتمكن من فتح/.test(document.body.innerText));
      if (!ok) flag(where, `expected a not-found page, got HTTP ${res.status()}`);
    } else if (opts.expectStatus && res && res.status() !== opts.expectStatus) flag(where, `expected HTTP ${opts.expectStatus}, got ${res.status()}`);
    if (!opts.expectStatus && final.startsWith("/login") && !path.startsWith("/login")) flag(where, "unexpectedly sent to login");
  }
  for (const e of [...new Set(errs)]) flag(where, e);

  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => new URL(i.src).pathname));
  for (const b of [...new Set(broken)]) flag(where, `broken image ${b}`);

  if (opts.mobile) {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 2) flag(where, `page is ${over}px wider than the phone screen`);
  }
  if (opts.lang === "ar") {
    const dir = await page.evaluate(() => document.documentElement.dir);
    if (dir !== "rtl") flag(where, `dir="${dir}" (expected rtl)`);
    for (const t of await englishLeftovers(page)) flag(where, `English left in Arabic: "${t.slice(0, 90)}"`);
  }
  const title = await page.title();
  if (!title || /undefined|null/.test(title)) flag(where, `bad page title "${title}"`);
  if (opts.shot) await page.screenshot({ path: `${SHOTS}/${opts.shot}.png`, fullPage: false }).catch(() => {});
  await page.close();
  return final;
}

(async () => {
  const browser = await chromium.launch();
  const started = Date.now();

  // Data the sweep needs (ids for dynamic pages) and the text restaurants/customers typed.
  const bh = await db.restaurant.findUniqueOrThrow({ where: { slug: "burger-house" } });
  const item = await db.menuItem.findFirstOrThrow({ where: { restaurantId: bh.id, archived: false } });
  const reel = await db.reel.findFirst({ where: { restaurantId: bh.id, status: "READY", visibility: "PUBLISHED" } });
  const category = await db.foodCategory.findFirstOrThrow({ where: { active: true } });
  const customer = await db.user.findUniqueOrThrow({ where: { email: "customer@numnum.demo" } });
  const custOrder = await db.order.findFirstOrThrow({ where: { userId: customer.id }, orderBy: { createdAt: "desc" } });
  const otherOrder = await db.order.findFirst({ where: { NOT: { userId: customer.id }, restaurantId: { not: bh.id } } });
  const invoice = await db.invoice.findFirst({ where: { restaurantId: bh.id } });
  const anyInvoice = invoice ?? (await db.invoice.findFirst());
  [
    ...(await db.restaurant.findMany({ select: { displayName: true, businessName: true, cuisine: true, description: true, area: true, city: true, address: true } })).flatMap(Object.values),
    ...(await db.menuItem.findMany({ select: { name: true, description: true, ingredients: true, allergens: true, dietaryLabels: true } })).flatMap((m) => [m.name, m.description, m.ingredients, m.allergens, ...(m.dietaryLabels || [])]),
    ...(await db.menuCategory.findMany({ select: { name: true } })).map((c) => c.name),
    ...(await db.foodCategory.findMany({ select: { name: true } })).map((c) => c.name),
    ...(await db.customizationOption.findMany({ select: { name: true } }).catch(() => [])).map((o) => o.name),
    ...(await db.customizationGroup.findMany({ select: { name: true } }).catch(() => [])).map((o) => o.name),
    ...(await db.reel.findMany({ select: { caption: true } })).map((r) => r.caption),
    ...(await db.restaurantReview.findMany({ select: { body: true } }).catch(() => [])).map((r) => r.body),
    ...(await db.itemReview.findMany({ select: { body: true } }).catch(() => [])).map((r) => r.body),
    ...(await db.user.findMany({ select: { name: true } })).map((u) => u.name),
    ...(await db.order.findMany({ select: { customerName: true, address: true, building: true, notes: true }, take: 2000 }).catch(() => [])).flatMap(Object.values),
    ...(await db.customerAddress.findMany({ select: { label: true, address: true, area: true, building: true } }).catch(() => [])).flatMap(Object.values),
  ].forEach((v) => v && (dataText += " " + String(v).toLowerCase()));

  const PUBLIC = ["/", "/explore", "/explore?q=burger", "/restaurants", `/category/${category.slug}`, `/r/${bh.slug}`, `/r/${bh.slug}#about`, `/item/${item.id}`, ...(reel ? [`/reel/${reel.id}`, `/r/${bh.slug}/reels/${reel.id}`] : []), "/cart", "/checkout", "/saved", "/login", "/account/register", "/business", "/business/register", "/terms", "/privacy", "/commission-agreement"];
  const CUSTOMER = ["/account", "/account/orders", "/account/addresses", `/order/${custOrder.reference}`, "/saved", "/checkout", `/r/${bh.slug}/review`, `/item/${item.id}/review`];
  const OWNER = ["/dashboard", "/dashboard/orders", "/dashboard/insights", "/dashboard/menu", "/dashboard/menu/items/new", `/dashboard/menu/items/${item.id}`, "/dashboard/menu/import", "/dashboard/menu/photos", "/dashboard/customizations", "/dashboard/reels", "/dashboard/reels/new", ...(reel ? [`/dashboard/reels/${reel.id}`] : []), "/dashboard/reviews", "/dashboard/billing", ...(invoice ? [`/dashboard/billing/${invoice.id}`] : []), "/dashboard/settings", "/dashboard/staff", "/dashboard/verification", "/dashboard/notifications", "/dashboard/agreement", "/dashboard/publish"];
  const ADMIN = ["/admin", "/admin/restaurants", "/admin/restaurants?filter=custom", `/admin/restaurants/${bh.id}`, "/admin/restaurants/new", "/admin/customers", "/admin/verifications", "/admin/orders", "/admin/commissions", "/admin/invoices", ...(anyInvoice ? [`/admin/invoices/${anyInvoice.id}`] : []), "/admin/payments", "/admin/disputes", "/admin/moderation", "/admin/categories", "/admin/settings", "/admin/audit", "/admin/push", "/admin/notifications"];

  const phone = (extra = {}) => browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, ...extra });
  const desktop = (extra = {}) => browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 900 }, ...extra });
  const shotName = (role, lang, dev, p) => `${role}-${lang}-${dev}${p.replace(/[^a-z0-9]+/gi, "_")}`.slice(0, 90);

  // ── 1. Every screen, every role, both languages ──
  const ONLY = (process.env.ONLY || "screens,errors,access,seo").split(",");
  const runs = [
    { role: "guest", paths: PUBLIC, devs: ["phone", "desktop"], langs: ["en", "ar"] },
    { role: "customer", login: ["customer@numnum.demo", "demo1234"], paths: CUSTOMER, devs: ["phone", "desktop"], langs: ["en", "ar"] },
    { role: "owner", login: ["owner@burgerhouse.demo", "demo1234"], paths: OWNER, devs: ["phone", "desktop"], langs: ["en", "ar"] },
    { role: "admin", login: [process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234"], paths: ADMIN, devs: ["desktop", "phone"], langs: ["en"] },
  ];
  for (const run of ONLY.includes("screens") ? runs : []) {
    for (const dev of run.devs) {
      const ctx = await (dev === "phone" ? phone() : desktop());
      if (run.login) await login(ctx, ...run.login);
      for (const lang of run.langs) {
        await setLang(ctx, lang);
        console.log(`sweeping ${run.role} · ${dev} · ${lang} (${run.paths.length} screens)`);
        for (const p of run.paths) await visit(ctx, `${run.role}/${dev}/${lang}`, p, { mobile: dev === "phone", lang, shot: shotName(run.role, lang, dev, p), allow4xx: ["/api/account/pending-review"] });
      }
      await ctx.close();
    }
  }

  // ── 2. Error pages ──
  console.log("checking error pages");
  if (ONLY.includes("errors")) {
    const ctx = await phone();
    await visit(ctx, "guest", "/this-page-does-not-exist", { expectStatus: 404, mobile: true, shot: "404-en" });
    await visit(ctx, "guest", "/r/no-such-restaurant", { expectStatus: 404, mobile: true });
    await visit(ctx, "guest", "/item/nope", { expectStatus: 404, mobile: true });
    await setLang(ctx, "ar");
    await visit(ctx, "guest", "/this-page-does-not-exist", { expectStatus: 404, mobile: true, lang: "ar", shot: "404-ar" });
    await ctx.close();
  }

  // ── 3. Access control ──
  console.log("checking access control");
  const deny = async (ctx, label, path, redirectRe) => visit(ctx, label, path, { expectRedirect: redirectRe, allow4xx: ["/"] });
  if (ONLY.includes("access")) {
    const g = await desktop();
    for (const p of ["/account", "/account/orders", "/dashboard", "/dashboard/orders", "/admin", "/admin/restaurants"]) await deny(g, "guest must not see", p, /^\/login/);
    // tracking link without its token must not reveal the order
    {
      const pg = await g.newPage();
      await pg.goto(`/order/${custOrder.reference}`, { waitUntil: "networkidle" });
      const body = await pg.locator("body").innerText();
      if (!/couldn't open this order/.test(body) || body.includes(custOrder.customerName)) flag(`[guest must not see] /order/${custOrder.reference}`, "order details visible without its link");
      await pg.close();
    }
    const api = await g.newPage();
    await api.goto("/terms");
    for (const [method, url] of [["GET", `/api/orders/${custOrder.reference}/status`], ["GET", "/api/dashboard/new-orders"], ["GET", "/api/admin/export?type=orders"], ["POST", `/api/orders/${custOrder.reference}/cancel`]]) {
      const s = await api.evaluate(async ([m, u]) => (await fetch(u, { method: m, headers: { "content-type": "application/json" }, body: m === "POST" ? "{}" : undefined, redirect: "manual" })).status, [method, url]);
      if (s < 400 && s !== 0) flag(`[guest API] ${method} ${url}`, `allowed (HTTP ${s}) — should be refused`);
    }
    const prof = await api.evaluate(async () => (await fetch("/api/account/checkout-profile")).json().catch(() => null));
    if (prof && (prof.user || (prof.addresses || []).length)) flag("[guest API] /api/account/checkout-profile", "returns account data to a guest");
    await g.close();

    const c = await desktop();
    await login(c, "customer@numnum.demo", "demo1234");
    for (const p of ["/dashboard", "/admin"]) {
      const end = await visit(c, "customer must not see", p, { allow4xx: ["/"], expectStatus: undefined }).catch(() => null);
      if (end && end.startsWith(p)) {
        const pg = await c.newPage();
        await pg.goto(p);
        const body = (await pg.locator("body").innerText()).slice(0, 400);
        if (!/not found|404|no access|register your restaurant|create.*restaurant|log in/i.test(body)) flag(`[customer] ${p}`, `customer can open it: "${body.slice(0, 80)}"`);
        await pg.close();
      }
    }
    if (otherOrder) {
      const pg = await c.newPage();
      await pg.goto("/");
      const s = await pg.evaluate(async (ref) => (await fetch(`/api/orders/${ref}/status`)).status, otherOrder.reference);
      if (s < 400) flag("[customer API] someone else's order status", `allowed (HTTP ${s})`);
      await pg.goto(`/order/${otherOrder.reference}`, { waitUntil: "networkidle" });
      const body = await pg.locator("body").innerText();
      if (!/couldn't open this order/.test(body) || body.includes(otherOrder.customerName)) flag("[customer] someone else's order page", "details visible");
      await pg.close();
    }
    await c.close();

    const o = await desktop();
    await login(o, "owner@burgerhouse.demo", "demo1234");
    const end = await visit(o, "owner must not see", "/admin", { allow4xx: ["/"] });
    if (end && end.startsWith("/admin")) {
      const pg = await o.newPage();
      await pg.goto("/admin");
      if ((await pg.locator("text=/Restaurants|Commissions/").count()) > 2 && !(await pg.locator("text=/not found|404/i").count())) flag("[owner] /admin", "restaurant owner can open the admin panel");
      await pg.close();
    }
    if (otherOrder) {
      const pg = await o.newPage();
      await pg.goto(`/dashboard/orders?ref=${otherOrder.reference}`, { waitUntil: "networkidle" });
      if (await pg.locator(`text=${otherOrder.reference}`).locator("visible=true").count().then((n) => n > 1)) flag("[owner] another restaurant's order", "visible in Burger House dashboard");
      await pg.close();
    }
    await o.close();
  }

  // ── 4. SEO & install basics ──
  console.log("checking robots, sitemap, manifest, headers");
  if (ONLY.includes("seo")) {
    const ctx = await desktop();
    const pg = await ctx.newPage();
    for (const p of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/sw.js", "/offline.html", "/icons/v2/icon-192.png", "/apple-touch-icon.png"]) {
      const r = await pg.goto(p).catch(() => null);
      if (!r || r.status() !== 200) flag(`[static] ${p}`, `HTTP ${r ? r.status() : "failed"}`);
    }
    const r = await pg.goto("/");
    const h = r.headers();
    for (const k of ["x-content-type-options", "referrer-policy"]) if (!h[k]) flag("[headers] /", `missing ${k}`);
    const meta = await pg.evaluate(() => ({ desc: document.querySelector('meta[name=description]')?.content, og: document.querySelector('meta[property="og:image"]')?.content, icon: !!document.querySelector('link[rel~=icon]') }));
    if (!meta.desc) flag("[seo] /", "no meta description");
    if (!meta.og) flag("[seo] /", "no og:image (link previews on WhatsApp/Instagram)");
    if (!meta.icon) flag("[seo] /", "no favicon link");
    await ctx.close();
  }

  await browser.close();
  await db.$disconnect();
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  fs.writeFileSync(`${SHOTS}/launch-problems.txt`, problems.join("\n"));
  console.log(`\nVisited ${pages} screens in ${mins} min.`);
  if (problems.length) {
    console.log(`${problems.length} problem(s):\n` + problems.map((p) => "  ✗ " + p).join("\n"));
    process.exit(1);
  }
  console.log("No problems found.");
})().catch(async (e) => {
  console.error("SWEEP CRASHED", e);
  fs.writeFileSync(`${SHOTS}/launch-problems.txt`, problems.join("\n"));
  console.log(problems.map((p) => "  ✗ " + p).join("\n"));
  await db.$disconnect();
  process.exit(2);
});
