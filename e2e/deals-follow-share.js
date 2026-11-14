// Deals, following restaurants and sharing on WhatsApp, end to end, checked in the UI and the DB.
// Needs a running, demo-seeded server:  BASE_URL=http://localhost:3000 node e2e/deals-follow-share.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || require("os").tmpdir();
const db = new PrismaClient();
let fails = 0;
const check = (c, m, x) => {
  console.log(`  ${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`);
  if (!c) fails++;
};
const section = (s) => console.log(`\n${s}`);
const money = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
const text = async (loc) => ((await loc.first().textContent({ timeout: 5000 }).catch(() => "")) || "").replace(/\s+/g, " ").trim();

async function login(ctx, email, pw) {
  const p = await ctx.newPage();
  // The "How was your order?" prompt (for an earlier delivered order) can appear on any page: close it.
  await p.addLocatorHandler(p.getByRole("dialog", { name: "How was your order?" }), async () => {
    await p.getByRole("button", { name: "Not now" }).click();
  });
  await p.goto("/login"); await settled(p);
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Log in" }).click()]);
  return p;
}
/** Waits until the page's streamed content has replaced its hidden holders (div[hidden][id^="S:"]). */
async function settled(p) {
  await p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
}
async function dismissReview(p) {
  const b = p.getByRole("button", { name: "Not now" });
  if (await b.isVisible().catch(() => false)) await b.click();
}
async function openReelOf(p, restaurantId) {
  const reel = await db.reel.findFirst({ where: { restaurantId, visibility: "PUBLISHED", status: "READY" }, orderBy: { publishedAt: "desc" }, include: { menuItem: true } });
  await p.goto(`/reel/${reel.id}`, { waitUntil: "load" }); await settled(p);
  await p.locator("section[data-index='0']:visible").waitFor();
  return reel;
}

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(`${p.url()}: ${e.message}`));
    p.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
  };
  const bh = await db.restaurant.findUniqueOrThrow({ where: { slug: "burger-house" } });
  const cust = await db.user.findUniqueOrThrow({ where: { email: "customer@numnum.demo" } });
  await db.deal.deleteMany({ where: { restaurantId: bh.id } });
  await db.restaurantFollow.deleteMany({ where: { userId: cust.id } });
  await db.restaurant.update({ where: { id: bh.id }, data: { followerCount: await db.restaurantFollow.count({ where: { restaurantId: bh.id } }), restrictPromotion: false } });
  await db.notification.deleteMany({ where: { userId: cust.id, type: { startsWith: "follow_" } } });

  // ── Following ──
  section("Follow a restaurant from a reel");
  const guestCtx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const g = await guestCtx.newPage();
  watch(g);
  await openReelOf(g, bh.id);
  await g.getByTestId("follow-button").first().click();
  check(await g.getByTestId("login-gate").isVisible(), "guest tapping + is asked to log in (Log in to follow restaurants)");
  check((await g.getByText("Log in to follow restaurants").count()) > 0, "the prompt explains following");

  const custCtx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const c = await login(custCtx, "customer@numnum.demo", "demo1234");
  watch(c);
  const before = (await db.restaurant.findUniqueOrThrow({ where: { id: bh.id } })).followerCount;
  await openReelOf(c, bh.id);
  await dismissReview(c);
  await c.getByTestId("follow-button").first().click();
  await c.waitForTimeout(1200);
  check(!!(await db.restaurantFollow.findUnique({ where: { userId_restaurantId: { userId: cust.id, restaurantId: bh.id } } })), "follow saved in the database");
  check((await db.restaurant.findUniqueOrThrow({ where: { id: bh.id } })).followerCount === before + 1, "Burger House follower count +1", (await db.restaurant.findUniqueOrThrow({ where: { id: bh.id } })).followerCount);
  const plusLeft = await c.locator('section[aria-label*="by Burger House"] [data-testid=follow-button]').count();
  check(plusLeft === 0, "the + disappears on every Burger House reel once followed (other restaurants keep theirs)", plusLeft);

  section("Restaurant page: Follow button and follower count");
  await c.goto(`/r/${bh.slug}`, { waitUntil: "load" }); await settled(c);
  check((await text(c.getByTestId("restaurant-follow"))) === "Following", "button shows Following", await text(c.getByTestId("restaurant-follow")));
  check((await text(c.getByTestId("follower-count"))).includes(String(before + 1)), "follower count shown", await text(c.getByTestId("follower-count")));

  section("Following feed");
  await c.goto("/", { waitUntil: "load" }); await settled(c);
  await dismissReview(c);
  await c.getByTestId("tab-following").click();
  await c.waitForFunction(() => document.querySelectorAll("section[data-index]").length > 0, null, { timeout: 15000 });
  const followingReels = await c.evaluate(() => [...document.querySelectorAll("section[data-index]")].map((s) => s.getAttribute("aria-label")));
  const bhReels = await db.reel.count({ where: { restaurantId: bh.id, visibility: "PUBLISHED", status: "READY" } });
  check(followingReels.length === bhReels && followingReels.every((l) => l.includes("Burger House")), `Following shows only Burger House reels (${bhReels})`, followingReels);
  await c.screenshot({ path: `${SHOTS}/following-feed.png` });
  await c.getByTestId("tab-foryou").click();
  await c.waitForTimeout(800);
  const forYou = await c.evaluate(() => [...document.querySelectorAll("section[data-index]")].map((s) => s.getAttribute("aria-label")));
  check(forYou.some((l) => !l.includes("Burger House")), "For you shows other restaurants again");

  section("Guest Following tab");
  await g.goto("/", { waitUntil: "load" }); await settled(g);
  await g.getByTestId("tab-following").click();
  check(await g.getByTestId("following-empty").isVisible(), "guest sees an explanation and a Log in button");

  // ── Deals ──
  section("Restaurant creates deals in the dashboard");
  const ownerCtx = await b.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const o = await login(ownerCtx, "owner@burgerhouse.demo", "demo1234");
  watch(o);
  await o.goto("/dashboard/deals?gate=off", { waitUntil: "load" }); await settled(o);
  await o.getByTestId("deal-kind-PERCENT_OFF").click();
  await o.fill("#deal-percent", "20");
  check((await o.getByText("Customers will see: 20% off the menu").count()) > 0, "preview: 20% off the menu");
  await o.getByTestId("deal-create").click();
  await o.getByTestId("deal-live").first().waitFor({ timeout: 10000 });
  await o.getByTestId("deal-kind-FREE_DELIVERY").click();
  await o.fill("#deal-min", "5");
  await o.getByTestId("deal-create").click();
  await o.waitForFunction(() => document.querySelectorAll("[data-testid=deal-live]").length === 2, null, { timeout: 10000 });
  const deals = await db.deal.findMany({ where: { restaurantId: bh.id, endedAt: null }, orderBy: { createdAt: "asc" } });
  check(deals.length === 2 && deals[0].kind === "PERCENT_OFF" && deals[0].percent === 20 && deals[1].kind === "FREE_DELIVERY" && deals[1].minSubtotalCents === 500, "two deals saved: 20% off, free delivery over $5", deals.map((d) => [d.kind, d.percent, d.minSubtotalCents]));
  check(deals[0].endsAt && Math.abs(new Date(deals[0].endsAt).getTime() - Date.now() - 7 * 86400_000) < 120_000, "runs for 7 days by default", deals[0].endsAt);
  await o.screenshot({ path: `${SHOTS}/dashboard-deals.png`, fullPage: true });

  section("Followers are told about the new deal (once)");
  await new Promise((r) => setTimeout(r, 1500));
  const notes = await db.notification.findMany({ where: { userId: cust.id, type: "follow_deal" } });
  check(notes.length === 1, "one notification for the first deal; the second deal within 20 h doesn't notify again", notes.length);
  check(notes[0]?.link === `/r/${bh.slug}`, "it links to the restaurant", notes[0]?.link);

  section("Customers see the deal on the reel, the dish and the restaurant page");
  const reel = await openReelOf(c, bh.id);
  const badge = await text(c.locator("section[data-index='0']:visible [data-testid=reel-deal]"));
  check(badge.includes("20% off"), "reel shows the deal badge", badge);
  const price = reel.menuItem.priceCents;
  const dealPrice = price - Math.round(price * 0.2);
  const orderBtn = await text(c.locator("section[data-index='0']:visible button", { hasText: "Order ·" }));
  check(money(orderBtn) === dealPrice / 100, `Order button shows the deal price ${dealPrice / 100}`, orderBtn);
  await c.screenshot({ path: `${SHOTS}/reel-deal.png` });
  await c.goto(`/r/${bh.slug}`, { waitUntil: "load" }); await settled(c);
  check((await text(c.getByTestId("restaurant-deals"))).includes("20% off the menu"), "restaurant page lists the deals", await text(c.getByTestId("restaurant-deals")));
  check((await text(c.getByTestId("restaurant-deals"))).includes("Free delivery over $5.00"), "including free delivery over $5");

  section("Checkout applies the deal; the order keeps it");
  await c.evaluate(() => localStorage.removeItem("nn_cart_v1"));
  await c.goto(`/r/${bh.slug}`, { waitUntil: "load" }); await settled(c);
  await c.getByLabel("Add Double Smash Burger").first().click();
  await c.getByRole("button", { name: /Add to cart/ }).waitFor();
  const addTxt = await text(c.getByRole("button", { name: /Add to cart/ }));
  check(addTxt.includes("6.00") && addTxt.includes("7.50"), "dish sheet: Add to cart · $6.00 with $7.50 crossed out", addTxt);
  await c.getByRole("button", { name: /Add to cart/ }).click();
  await c.waitForTimeout(600);
  await c.goto("/checkout", { waitUntil: "load" }); await settled(c);
  await dismissReview(c);
  await c.getByText("How would you like your order?").waitFor();
  await c.getByRole("button", { name: /^Delivery/ }).first().click();
  await c.getByRole("button", { name: "Continue" }).click();
  await c.getByRole("button", { name: "Review order" }).click();
  await c.getByTestId("deal-applied").waitFor({ timeout: 10000 });
  const applied = await text(c.getByTestId("deal-applied"));
  check(applied.includes("20% off the menu") && applied.includes("Free delivery"), "checkout: Deal applied: 20% off the menu · Free delivery", applied);
  const totalTxt = await text(c.getByRole("button", { name: /Place order/ }));
  check(money(totalTxt) === 6, "Place order · $6.00 (food $7.50 − $1.50, delivery free)", totalTxt);
  await c.screenshot({ path: `${SHOTS}/checkout-deal.png`, fullPage: true });
  await Promise.all([c.waitForURL(/\/order\//, { timeout: 20000 }), c.getByRole("button", { name: /Place order/ }).click()]);
  const ref = c.url().match(/\/order\/([^?]+)/)[1];
  const ord = await db.order.findUnique({ where: { reference: ref } });
  check(ord.subtotalCents === 750 && ord.discountCents === 150 && ord.deliveryFeeCents === 0 && ord.deliveryFeeWaivedCents > 0 && ord.totalCents === 600, "DB: subtotal 750, discount 150, delivery 0 (waived), total 600", [ord.subtotalCents, ord.discountCents, ord.deliveryFeeCents, ord.deliveryFeeWaivedCents, ord.totalCents]);
  check(ord.commissionBaseCents === 600, "commission base = what the customer pays for the food ($6.00)", ord.commissionBaseCents);
  check((await text(c.getByTestId("order-deal"))).includes("20% off the menu"), "customer order page shows the deal", await text(c.getByTestId("order-deal")));
  await o.goto(`/dashboard/orders?ref=${ref}&gate=off`, { waitUntil: "load" }); await settled(o);
  check((await text(o.getByTestId("order-deal"))).includes("20% off"), "restaurant's order card shows the deal and discount", await text(o.getByTestId("order-deal")));

  section("Ending a deal removes it everywhere");
  await o.goto("/dashboard/deals?gate=off", { waitUntil: "load" }); await settled(o);
  for (let i = 0; i < 2; i++) {
    await o.getByRole("button", { name: "End deal" }).first().click();
    await o.waitForTimeout(1200);
  }
  check((await db.deal.count({ where: { restaurantId: bh.id, endedAt: null } })) === 0, "both deals ended in the database");
  await openReelOf(c, bh.id);
  check((await c.locator("section[data-index='0']:visible [data-testid=reel-deal]").count()) === 0, "no deal badge on the reel any more");

  section("Overdue invoice pauses deals");
  await db.restaurant.update({ where: { id: bh.id }, data: { restrictPromotion: true } });
  await o.goto("/dashboard/deals?gate=off", { waitUntil: "load" }); await settled(o);
  check((await o.getByText("Deals are paused while an invoice is overdue").count()) > 0, "dashboard says deals are paused");
  check(await o.getByTestId("deal-create").isDisabled(), "Start deal is disabled");
  await db.restaurant.update({ where: { id: bh.id }, data: { restrictPromotion: false } });

  // ── Sharing ──
  section("Share a reel on WhatsApp with a picture preview");
  const r2 = await openReelOf(c, bh.id);
  await c.locator("section[data-index='0']:visible [aria-label=Share]").click();
  await c.getByTestId("share-sheet").waitFor();
  const wa = await c.getByTestId("share-whatsapp").getAttribute("href");
  const waText = decodeURIComponent(wa.split("text=")[1] || "");
  check(wa.startsWith("https://wa.me/?text=") && waText.includes(`/reel/${r2.id}`) && waText.includes("Burger House"), "WhatsApp button opens wa.me with the dish, restaurant and the reel link", waText);
  await c.screenshot({ path: `${SHOTS}/share-sheet.png` });
  const html = await (await fetch(`${BASE}/reel/${r2.id}`)).text();
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  check(!!og && og.includes(`/og/reel/${r2.id}.jpg`), "link preview picture set (og:image)", og);
  check(/<meta property="og:title" content="[^"]*Burger House/.test(html), "preview title has the dish and restaurant");
  const img = await fetch(og.replace(/^https?:\/\/[^/]+/, BASE));
  const buf = Buffer.from(await img.arrayBuffer());
  const meta = await require("sharp")(buf).metadata();
  check(img.headers.get("content-type") === "image/jpeg" && meta.width === 1200 && meta.height === 630, "preview picture is a 1200×630 JPEG (what WhatsApp shows)", [img.headers.get("content-type"), meta.width, meta.height]);
  require("fs").writeFileSync(`${SHOTS}/og-reel.jpg`, buf);
  for (const u of [`/og/restaurant/${bh.slug}.jpg`, `/og/item/${r2.menuItemId}.jpg`]) {
    const r = await fetch(BASE + u);
    check(r.ok && r.headers.get("content-type") === "image/jpeg", `${u} serves a JPEG preview`, [r.status, r.headers.get("content-type")]);
  }

  section("Errors");
  check(errors.length === 0, "no page errors or server errors", errors.slice(0, 5));
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
