// Food creators, end to end in a real browser (phone):
// apply → admin approves → post a real video tagging a dish → the restaurant accepts → it's in the
// feed with the creator, "Paid partnership" and the Order button → follow → pin → verification →
// another restaurant declines with a reason → re-tag → removal → suspension → Arabic.
//   BASE_URL=http://localhost:3000 node e2e/creators.js
const path = require("path");
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ROOT = path.resolve(__dirname, "..");
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const section = (s) => console.log(`\n${s}`);
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const HANDLE = `e2e.eats${Date.now() % 100000}`;
let ip = 20;
/** The page says the reel isn't there (pages answer 200 with a "not found" screen while streaming). */
const reelHidden = async (page, id) => /Reel not found/.test(await (await page.request.get(`/reel/${id}`)).text());
const profileHidden = async (page, handle) => !(await (await page.request.get(`/c/${handle}`)).text()).includes('data-testid="creator-profile"');

(async () => {
  const db = new PrismaClient();
  const started = new Date();
  const b = await chromium.launch();
  const errors = [];
  async function as(email, password = "demo1234", lang) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.3.3.${ip++}` } });
    if (lang) await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email} on ${p.url()}: ${String(e).slice(0, 120)}`));
    p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Not our dish" : undefined));
    await p.addLocatorHandler(p.getByRole("dialog", { name: "How was your order?" }), async () => p.getByRole("button", { name: "Not now" }).click({ timeout: 3000 }).catch(() => {}));
    await p.goto("/login"); await p.fill("#email", email); await p.fill("#password", password);
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.locator("form:has(#password) button[type=submit]").click()]);
    return p;
  }
  const creatorUser = await db.user.findUnique({ where: { email: "buyer2@numnum.demo" } });
  await db.creator.deleteMany({ where: { userId: creatorUser.id } });
  await db.user.update({ where: { id: creatorUser.id }, data: { locale: null } }); // the Arabic step at the end saves Arabic to the account
  const sampleVideo = await db.mediaAsset.findFirst({ where: { url: { endsWith: ".mp4" }, reels: { some: {} } } });
  const videoFile = path.join(ROOT, "storage/public", sampleVideo.url.replace(/^\/media\//, ""));
  const photo = path.join(ROOT, "storage/public", sampleVideo.posterUrl.replace(/^\/media\//, "")); // the demo video's poster image

  section("New here: login page → Food creator? → account → application");
  {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.3.4.${ip++}` } });
    const n = await ctx.newPage();
    n.on("pageerror", (e) => errors.push(`new user on ${n.url()}: ${String(e).slice(0, 120)}`));
    await n.goto("/login", { waitUntil: "load" }); await settle(n);
    await n.locator("[data-testid=creator-card]:visible").click();
    await n.waitForURL(/\/account\/register/); await settle(n);
    const email = `new-creator-${Date.now()}@numnum.test`;
    await n.fill("#name", "New Creator"); await n.fill("#email", email); await n.fill("#phone", "70 123 456"); await n.fill("#password", "new-creator-1");
    await n.getByTestId("customer-terms").check();
    await n.locator("form:has(#password) button[type=submit]").click();
    await n.waitForURL(/\/creator\/apply/, { timeout: 15000 }).catch(() => {});
    await settle(n);
    check(new URL(n.url()).pathname === "/creator/apply" && (await n.locator("[data-testid=creator-form]:visible").count()) === 1, "a new person creates an account and lands on the creator application", n.url());
    await db.user.deleteMany({ where: { email } });
    await ctx.close();
  }

  section("Apply");
  const c = await as("buyer2@numnum.demo");
  await c.goto("/account", { waitUntil: "load" }); await settle(c);
  await c.locator("a[href='/creator/apply']:visible").click();
  await c.waitForURL(/\/creator\/apply/); await settle(c);
  await c.locator("input[type=file][accept='image/*']").setInputFiles(photo);
  await c.waitForFunction(() => document.querySelector("[data-testid=creator-form] button img"), null, { timeout: 15000 });
  await c.fill("#handle", HANDLE);
  await c.fill("#bio", "Burgers and manakish around Beirut");
  await c.fill("#instagram", "@e2e.eats");
  await c.fill("#audienceSize", "12000");
  await c.fill("#area", "Beirut");
  await c.getByRole("button", { name: "Send my application" }).click({ timeout: 15000 }).catch(async (e) => { await c.screenshot({ path: (process.env.SHOTS || "/tmp") + "/creators-apply.png", fullPage: true }); console.log("debug", c.url(), (await c.locator("body").innerText()).slice(0, 400)); throw e; });
  // Saved (the page moves on by itself; /creator sends a pending applicant back to this page).
  for (let i = 0; i < 50 && !(await db.creator.findUnique({ where: { handle: HANDLE } })); i++) await new Promise((r) => setTimeout(r, 200));
  await c.waitForTimeout(800);
  await c.goto("/creator/apply", { waitUntil: "load" }); await settle(c);
  const pendingShown = await c.locator("[data-testid=creator-pending]:visible").waitFor({ timeout: 10000 }).then(() => true, () => false);
  if (!pendingShown) console.log("debug", c.url(), (await c.locator("body").innerText()).slice(0, 300));
  check(pendingShown, "Account → Become a food creator → form → 'being reviewed'");
  const applied = await db.creator.findUnique({ where: { handle: HANDLE } });
  check(applied?.status === "PENDING" && applied.audienceSize === 12000 && !!applied.avatarUrl, "saved with photo and details", applied);

  section("Admin approves");
  const a = await as(process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234");
  await a.goto("/admin/creators", { waitUntil: "load" }); await settle(a);
  const card = a.getByTestId("admin-creator").filter({ hasText: `@${HANDLE}` });
  check(await card.isVisible(), "the application is in Admin → Creators");
  await card.getByRole("button", { name: "Approve" }).click();
  await a.waitForTimeout(1500);
  const approved = await db.creator.findUnique({ where: { handle: HANDLE } });
  check(approved.status === "APPROVED", "approved", approved.status);
  check((await db.notification.count({ where: { userId: creatorUser.id, type: "creator_approved", createdAt: { gte: started } } })) === 1, "the creator is notified (and emailed the welcome)");

  section("Post a reel (real video, same pipeline as restaurants)");
  await c.goto("/creator", { waitUntil: "load" }); await settle(c);
  await c.getByTestId("new-reel").click();
  await c.waitForURL(/\/creator\/new/); await settle(c);
  await c.getByTestId("video-input").setInputFiles(videoFile);
  await c.getByText("Uploaded").waitFor({ timeout: 120000 });
  await c.getByTestId("dish-search").fill("Double Smash");
  await c.getByTestId("dish-result").filter({ hasText: "Burger House" }).first().click();
  await c.getByTestId("paid-partnership").check();
  await c.fill("#caption", "Best smash in Hamra");
  await c.getByTestId("post-reel").click();
  await c.waitForURL((u) => u.pathname === "/creator");
  const reel = await db.reel.findFirst({ where: { creatorId: approved.id }, orderBy: { createdAt: "desc" }, include: { restaurant: true } });
  check(reel?.tagStatus === "PENDING" && reel.restaurant.slug === "burger-house" && reel.paidPartnership, "posted: waiting for Burger House, paid partnership", reel && { tag: reel.tagStatus, r: reel.restaurant.slug });
  for (let i = 0; i < 90 && (await db.reel.findUnique({ where: { id: reel.id } })).status !== "READY"; i++) await new Promise((r) => setTimeout(r, 1000));
  const processed = await db.reel.findUnique({ where: { id: reel.id } });
  check(processed.status === "READY" && processed.visibility === "DRAFT", "processed, still private", { s: processed.status, v: processed.visibility });
  await c.reload({ waitUntil: "load" }); await settle(c);
  check((await c.getByTestId("studio-reel").first().innerText()).includes("Waiting for Burger House to approve"), "studio: 'Waiting for Burger House to approve'");
  check(await reelHidden(c, reel.id), "not public before the restaurant accepts");

  section("The restaurant accepts");
  const r = await as("owner@burgerhouse.demo");
  await r.goto("/dashboard", { waitUntil: "load" }); await settle(r);
  check((await db.notification.count({ where: { restaurantId: reel.restaurantId, type: "creator_tag" } })) >= 1, "the restaurant got the tag notification");
  await r.goto("/dashboard/creator-reels", { waitUntil: "load" }); await settle(r);
  const pending = r.getByTestId("pending-tag").first();
  check(await pending.isVisible() && (await pending.innerText()).includes(`@${HANDLE}`), "Creator reels shows it, with the creator");
  await pending.getByTestId("accept-tag").click();
  await r.getByTestId("live-tag").first().waitFor({ timeout: 10000 });
  check((await db.reel.findUnique({ where: { id: reel.id } })).visibility === "PUBLISHED", "accepted: live");

  section("Customers see it, order, follow");
  const v = await as("customer@numnum.demo");
  await v.goto(`/reel/${reel.id}`, { waitUntil: "load" }); await settle(v);
  const slide = v.locator("section[data-active='true']");
  check((await slide.getByTestId("reel-creator").innerText()).includes(`@${HANDLE}`), "the reel shows the creator");
  check(await slide.getByTestId("paid-label").isVisible(), "and 'Paid partnership'");
  check((await slide.innerText()).includes("Burger House") && (await slide.getByRole("button", { name: /Order/ }).count()) > 0, "with the restaurant and the Order button");
  await v.waitForFunction(() => { const x = document.querySelector("section[data-active='true'] video"); return x && x.currentTime > 0.3; }, null, { timeout: 20000 }).then(() => check(true, "the video plays"), () => check(false, "the video plays"));
  await slide.getByTestId("reel-creator").click();
  await v.waitForURL(new RegExp(`/c/${HANDLE.replace(".", "\\.")}`)); await settle(v);
  check(await v.locator("[data-testid=creator-profile]:visible").waitFor({ timeout: 10000 }).then(() => true, () => false), "tap the creator → their profile");
  await v.getByTestId("follow-creator").click();
  await v.waitForTimeout(1200);
  check((await db.creator.findUnique({ where: { handle: HANDLE } })).followerCount === 1, "follow works (1 follower)");
  const following = await v.evaluate(async () => (await (await fetch("/api/feed?tab=following")).json()).reels.map((x) => x.id));
  check(following.includes(reel.id), "the reel is in the follower's Following tab");

  section("Pin and verification");
  await c.goto("/creator", { waitUntil: "load" }); await settle(c);
  await c.getByTestId("pin-reel").first().click();
  await c.waitForTimeout(1200);
  check(!!(await db.reel.findUnique({ where: { id: reel.id } })).pinnedAt, "pinned");
  await c.getByTestId("request-verification").click();
  await c.getByTestId("verification-note").fill("DM me on Instagram @e2e.eats");
  await c.getByTestId("send-verification").click();
  await c.getByTestId("verification-pending").waitFor({ timeout: 10000 });
  await a.goto("/admin/creators?tab=verification", { waitUntil: "load" }); await settle(a);
  await a.getByTestId("admin-creator").filter({ hasText: `@${HANDLE}` }).getByRole("button", { name: "Verify" }).click();
  await a.waitForTimeout(1500);
  await v.goto(`/c/${HANDLE}`, { waitUntil: "load" }); await settle(v);
  check(await v.getByTestId("creator-verified").isVisible(), "verified badge on the profile");
  check((await v.locator("[data-testid=creator-grid] > div").first().getAttribute("data-pinned")) === "true", "the pinned reel is first in the grid");
  await c.goto("/creator/insights", { waitUntil: "load" }); await settle(c);
  check((await c.getByTestId("creator-tiles").innerText()).includes("orders from your reels") && (await c.getByTestId("creator-reel-stats").locator("li").count()) === 1, "insights: big numbers and the reel");

  section("Another restaurant declines; re-tag");
  await c.goto("/creator/new", { waitUntil: "load" }); await settle(c);
  await c.getByTestId("video-input").setInputFiles(videoFile);
  await c.getByText("Uploaded").waitFor({ timeout: 120000 });
  await c.getByTestId("dish-search").fill("Latte");
  await c.getByTestId("dish-result").filter({ hasText: "Bean Bar" }).first().click();
  await c.getByTestId("post-reel").click();
  await c.waitForURL((u) => u.pathname === "/creator");
  const second = await db.reel.findFirst({ where: { creatorId: approved.id, id: { not: reel.id } } });
  for (let i = 0; i < 90 && (await db.reel.findUnique({ where: { id: second.id } })).status !== "READY"; i++) await new Promise((r2) => setTimeout(r2, 1000));
  const bb = await as("owner@beanbar.demo");
  await bb.goto("/dashboard/creator-reels", { waitUntil: "load" }); await settle(bb);
  await bb.getByTestId("pending-tag").first().getByTestId("decline-tag").click();
  await bb.getByTestId("decline-reason").fill("Not our latte");
  await bb.getByTestId("confirm-decline").click();
  await bb.waitForTimeout(1500);
  await c.goto("/creator", { waitUntil: "load" }); await settle(c);
  const declined = c.locator("[data-testid=studio-reel][data-tag=DECLINED]");
  check((await declined.innerText()).includes("Declined by Bean Bar") && (await declined.innerText()).includes("Not our latte"), "studio: 'Declined by Bean Bar' with the reason");
  await declined.getByTestId("retag-reel").click();
  await c.getByTestId("dish-search").last().fill("Manousheh");
  await c.getByTestId("dish-result").first().click();
  await c.getByRole("button", { name: "Send the tag" }).click();
  await c.waitForTimeout(1500);
  const retagged = await db.reel.findUnique({ where: { id: second.id }, include: { restaurant: true } });
  check(retagged.tagStatus === "PENDING" && retagged.restaurant.slug === "manousheh-corner", "re-tagged to another restaurant, waiting again", { t: retagged.tagStatus, r: retagged.restaurant.slug });

  section("Removal and suspension");
  await r.goto("/dashboard/creator-reels", { waitUntil: "load" }); await settle(r);
  await r.getByTestId("live-tag").first().getByTestId("remove-tag").click();
  await r.waitForTimeout(1500);
  check(await reelHidden(v, reel.id), "the restaurant removes it: gone from the feed");
  await db.reel.update({ where: { id: reel.id }, data: { tagStatus: "ACCEPTED", visibility: "PUBLISHED" } }); // back, to test suspension
  await a.goto("/admin/creators?tab=approved", { waitUntil: "load" }); await settle(a);
  await a.getByTestId("admin-creator").filter({ hasText: `@${HANDLE}` }).getByRole("button", { name: "Suspend" }).click();
  await a.waitForTimeout(1500);
  check((await reelHidden(v, reel.id)) && (await profileHidden(v, HANDLE)), "suspended: reels and profile hidden");
  check(!(await reelHidden(v, (await db.reel.findFirst({ where: { creatorId: null, visibility: "PUBLISHED", status: "READY" } })).id)), "(a normal reel still shows: the check above is meaningful)");

  section("Arabic");
  const ar = await as("buyer2@numnum.demo", "demo1234", "ar");
  await ar.goto("/creator", { waitUntil: "load" }); await settle(ar);
  check((await ar.locator("h1").first().innerText()).includes("استوديو صانع المحتوى") && (await ar.evaluate(() => document.documentElement.dir)) === "rtl", "the studio in Arabic, right-to-left", await ar.locator("h1").first().innerText());

  check(!errors.length, "no page errors", errors);
  await db.creator.deleteMany({ where: { handle: HANDLE } });
  await db.user.update({ where: { id: creatorUser.id }, data: { locale: null } });
  await b.close(); await db.$disconnect();
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
