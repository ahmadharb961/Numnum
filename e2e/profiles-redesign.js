// The redesigned restaurant and creator pages: restaurant (name + Follow, five stats with followers
// as 2.3K, one Pick up · Delivering to · time/distance/fee card) and creator (share, stats, Reels |
// Favorites — the reels the creator saved — opening a favorites viewer with Back to that tab).
//   BASE_URL=http://localhost:3000 node e2e/profiles-redesign.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const SHOTS = process.env.SHOTS || "/tmp";

(async () => {
  const db = new PrismaClient();
  const bh = await db.restaurant.findFirstOrThrow({ where: { slug: "burger-house" } });
  const foodies = await db.creator.findFirstOrThrow({ where: { handle: "mr.foodies" } });
  const realCount = bh.followerCount;
  await db.restaurant.update({ where: { id: bh.id }, data: { followerCount: 2350 } });
  const b = await chromium.launch();
  const errors = [];
  const made = [];
  try {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
    // A delivery spot ~0.5 km from Burger House (Hamra).
    await ctx.addCookies([{ name: "nn_lang", value: "en", url: BASE }, { name: "nn_loc", value: encodeURIComponent(JSON.stringify({ lat: (bh.latitude ?? 33.8959) + 0.004, lng: bh.longitude ?? 35.4787, label: "Wata El Moussaitbeh" })), url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

    console.log("\nRestaurant page");
    await p.goto(`/r/${bh.slug}`, { waitUntil: "load" }); await settle(p);
    const h1 = await p.locator("h1").first().boundingBox();
    const follow = await p.getByTestId("restaurant-follow").boundingBox();
    check(h1 && follow && Math.abs(h1.y + h1.height / 2 - (follow.y + follow.height / 2)) < 30 && follow.x > h1.x, "the name with the Follow button on its right");
    const meta = await p.getByTestId("restaurant-meta").innerText();
    check(meta.includes("•") && meta.includes("Hamra"), "cuisine • area under the name", meta);
    const stats = (await p.getByTestId("restaurant-stats").innerText()).replace(/\s+/g, " ");
    check(/reel views/.test(stats) && /menu items/.test(stats) && /reels/.test(stats) && /followers/.test(stats) && (await p.locator("[data-testid=restaurant-stats] > *").count()) === 5, "five stats: rating, reel views, menu items, reels, followers", stats);
    check((await p.getByTestId("follower-count").innerText()) === "2.3K", "2,350 followers shows as 2.3K", await p.getByTestId("follower-count").innerText());
    const ful = (await p.getByTestId("restaurant-fulfillment").innerText()).replace(/\s+/g, " ");
    check(/Pick up/.test(ful) && /Ready in \d+ min/.test(ful) && /Delivering to/.test(ful) && /Wata El Moussaitbeh/.test(ful), "one card: Pick up · Ready in N min | Delivering to <your spot>", ful);
    const where = await p.getByTestId("deliver-to").evaluate((el) => { const s = el.querySelector("span span:last-child span"); return s ? s.getBoundingClientRect().width : 0; });
    check(where >= 60, "the delivery spot's name has room to show (not squeezed by the other two)", where);
    const pill = (await p.getByTestId("delivery-pill").innerText().catch(() => "")).replace(/\s+/g, " ");
    check(/\d+–\d+ min/.test(pill) && /\d+(\.\d+)? ?(km|m)\b/.test(pill) && /\$/.test(pill), "and the green pill: time, distance and fee", pill);
    check((await p.getByText("Hours & Contact").count()) === 0 && (await p.getByRole("link", { name: /Order now/ }).count()) === 0, "the extra cards are gone (hours and contact are under About)");
    await p.screenshot({ path: `${SHOTS}/restaurant-redesign.png`, fullPage: false });

    console.log("\nCreator page");
    // Mr. Foodies saves two reels: his Favorites.
    const reels = await db.reel.findMany({ where: { visibility: "PUBLISHED", status: "READY", creatorId: null, restaurant: { status: "ACTIVE" } }, take: 2, orderBy: { viewCount: "desc" }, select: { id: true, menuItem: { select: { name: true } } } });
    for (const [i, r] of reels.entries()) {
      const s = await db.savedItem.upsert({ where: { ownerKey_type_refId: { ownerKey: `u:${foodies.userId}`, type: "REEL", refId: r.id } }, create: { ownerKey: `u:${foodies.userId}`, type: "REEL", refId: r.id, createdAt: new Date(Date.now() - i * 1000) }, update: {} });
      made.push(s.id);
    }
    await p.goto(`/c/${foodies.handle}`, { waitUntil: "load" }); await settle(p);
    check((await p.getByTestId("creator-topbar-handle").innerText()).includes(`@${foodies.handle}`), "top bar on the banner: @mr.foodies");
    check(await p.locator("[data-testid=creator-banner] img").evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false), "his banner across the top");
    const cstats = (await p.getByTestId("creator-stats").innerText()).replace(/\s+/g, " ");
    check(/reels/.test(cstats) && /followers/.test(cstats) && /reel views/.test(cstats), "three stats: reels, followers, reel views", cstats);
    check((await p.getByTestId("creator-profile").innerText()).includes("FOOD CREATOR") || (await p.getByTestId("creator-profile").innerText()).toLowerCase().includes("food creator"), "@handle with the FOOD CREATOR badge");
    await p.getByTestId("share-open").click();
    const wa = await p.getByTestId("share-whatsapp").getAttribute("href").catch(() => "");
    check(decodeURIComponent(wa || "").includes(`/c/${foodies.handle}`), "the share button shares the profile on WhatsApp (or copies the link)", wa);
    await p.keyboard.press("Escape");
    check((await p.getByTestId("creator-more").count()) === 0, "visitors get only the share button (no “…” menu)");
    await p.screenshot({ path: `${SHOTS}/creator-redesign.png`, fullPage: false });
    await p.getByTestId("creator-tab-favorites").click();
    const favs = await p.locator("[data-testid=creator-favorites] [data-testid=reel-thumb]").count();
    check(favs === reels.length, `Favorites: the ${reels.length} reels he saved`, favs);
    await p.screenshot({ path: `${SHOTS}/creator-favorites.png`, fullPage: false });
    await p.locator("[data-testid=creator-favorites] [data-testid=reel-thumb]").first().click();
    await p.waitForURL(/\/favorites\//, { timeout: 10000 }); await settle(p);
    const title = await p.getByTestId("reel-list-title").innerText().catch(() => "");
    check(title.includes(`${foodies.displayName}'s favorites`) && title.includes(`1 / ${reels.length}`), `opens his favorites to swipe: “${foodies.displayName}'s favorites · 1 / ${reels.length}”`, title);
    await p.getByTestId("reel-back").click();
    await p.waitForURL((u) => u.pathname === `/c/${foodies.handle}`, { timeout: 10000 }); await settle(p);
    check((await p.getByTestId("creator-tab-favorites").getAttribute("aria-selected")) === "true", "Back returns to his Favorites tab");
  } finally {
    await db.restaurant.update({ where: { id: bh.id }, data: { followerCount: realCount } });
    await db.savedItem.deleteMany({ where: { id: { in: made } } });
  }
  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
