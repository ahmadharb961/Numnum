// Back from a restaurant returns to the very reel you were watching (same tab, same reel, playing at
// once), and the Following tab's first reel is loaded in advance so it plays straight away, on a
// slow 4G-like connection.
//   BASE_URL=http://localhost:3000 node e2e/feed-return.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const activeInfo = (p) => p.evaluate(() => { const s = document.querySelector("section[data-active='true']"); const v = s?.querySelector("video"); return { index: Number(s?.dataset.index ?? -1), label: s?.getAttribute("aria-label") || "", t: v ? v.currentTime : -1, ready: v ? v.readyState : -1 }; });
/** ms until the reel on screen is really playing (its clock moves), or -1. */
async function timeToPlay(p, since, timeout = 15000) {
  const ok = await p.waitForFunction(() => { const v = document.querySelector("section[data-active='true'] video"); return !!v && v.currentTime > 0.05 && !v.paused; }, null, { timeout, polling: 20 }).then(() => true).catch(() => false);
  return ok ? Date.now() - since : -1;
}
async function swipeTo(p, n) {
  for (let i = 0; i < 20 && (await activeInfo(p)).index < n; i++) {
    await p.evaluate(() => { const s = document.querySelector("section[data-active='true']"); s.parentElement.scrollBy({ top: s.clientHeight, behavior: "instant" }); });
    await p.waitForTimeout(600);
  }
}
async function slow4g(p) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8 });
}

(async () => {
  const db = new PrismaClient();
  const cust = await db.user.findUnique({ where: { email: "customer@numnum.demo" } });
  const followed = await db.restaurant.findMany({ where: { slug: { in: ["burger-house", "bean-bar"] } } });
  for (const r of followed) await db.restaurantFollow.upsert({ where: { userId_restaurantId: { userId: cust.id, restaurantId: r.id } }, create: { userId: cust.id, restaurantId: r.id }, update: {} });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.9.8.7" } });
  // HLSJS=1: play HLS through hls.js, as Android Chrome does (otherwise natively, as on iPhone).
  if (process.env.HLSJS) await ctx.addInitScript(() => { const o = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (t) { return /mpegurl/i.test(t) ? "" : o.call(this, t); }; });
  const p = await ctx.newPage();
  await p.addLocatorHandler(p.getByRole("dialog", { name: "How was your order?" }), async () => p.getByRole("button", { name: "Not now" }).click({ timeout: 3000 }).catch(() => {}));
  await p.goto("/login"); await p.fill("#email", "customer@numnum.demo"); await p.fill("#password", "demo1234");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Log in" }).click()]);
  await slow4g(p);

  console.log("\nReel → restaurant → Back");
  await p.goto("/", { waitUntil: "load" });
  const first = await timeToPlay(p, Date.now(), 20000);
  check(first >= 0, "first reel plays", first < 0 ? await p.evaluate(() => { const s = document.querySelector("section[data-active='true']"); const v = s?.querySelector("video"); return { sections: document.querySelectorAll("section[data-index]").length, index: s?.dataset.index, video: !!v, paused: v?.paused, t: v?.currentTime, rs: v?.readyState, err: v?.error?.code, src: v?.getAttribute("src")?.slice(0, 30), playBtn: !!s?.querySelector("[aria-label='Play']") }; }) : first);
  await swipeTo(p, 2);
  await timeToPlay(p, Date.now());
  await p.waitForTimeout(1500);
  const before = await activeInfo(p);
  check(before.index === 2, "on the third reel", before);
  await p.locator("section[data-active='true'] a[href^='/r/']").first().click();
  await p.waitForURL(/\/r\//);
  await p.locator("[data-testid=back-button]:visible").waitFor();
  await p.waitForTimeout(800);
  const backAt = Date.now();
  await p.locator("[data-testid=back-button]:visible").click();
  await p.waitForURL((u) => u.pathname === "/");
  await p.locator("section[data-active='true']").waitFor();
  const after = await activeInfo(p);
  check(after.index === before.index && after.label === before.label, "Back returns to the same reel (not Restaurants, not the first reel)", { before, after });
  const back = await timeToPlay(p, backAt);
  check(back >= 0 && back < 1500, `and it plays at once (${back} ms)`, back);
  if (!process.env.HLSJS) check(after.ready >= 2, "its video was kept loaded (no reload)", after.ready); // hls.js reloads it from the HTTP cache instead

  console.log("\nRestaurant page opened directly");
  const p2 = await ctx.newPage();
  await p2.goto("/r/burger-house", { waitUntil: "load" });
  await p2.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {}); // streamed content in place
  await p2.locator("[data-testid=back-button]:visible").click();
  await p2.waitForURL(/\/restaurants/).then(() => true, () => false);
  check(new URL(p2.url()).pathname === "/restaurants", "Back goes to Restaurants when there is no reel to return to", p2.url());
  await p2.close();

  console.log("\nFollowing tab");
  await swipeTo(p, 3);
  await timeToPlay(p, Date.now());
  const forYou = await activeInfo(p);
  await p.waitForTimeout(9000); // Following and its first reel load in the background
  const folFirstLabel = await p.evaluate(async () => (await (await fetch("/api/feed?tab=following")).json()).reels[0]);
  const sameFirst = folFirstLabel && forYou.label.startsWith(folFirstLabel.item?.name ?? "\u0000");
  if (!process.env.HLSJS && !sameFirst) {
    const warmed = await p.evaluate(() => [...document.querySelectorAll("body > video")].filter((v) => v.readyState >= 2).length);
    check(warmed >= 1, "Following's first reel is loaded in advance", warmed);
  }
  let at = Date.now();
  await p.getByTestId("tab-following").click();
  const tf = await timeToPlay(p, at);
  const vstate = () => p.evaluate(() => { const s = document.querySelector("section[data-active='true']"); const v = s?.querySelector("video"); return { index: s?.dataset.index, label: s?.getAttribute("aria-label"), video: !!v, paused: v?.paused, t: v?.currentTime, rs: v?.readyState, err: v?.error?.code, src: v?.getAttribute("src")?.slice(-40), playBtn: !!s?.querySelector("[aria-label='Play']") }; });
  check(tf >= 0 && tf < 700, `Following's first reel plays at once (${tf} ms${(await activeInfo(p)).label === forYou.label ? ", the same reel you were on in For you" : ""})`, tf < 0 ? await vstate() : tf);
  const fol = await activeInfo(p);
  check(/Burger House|Bean Bar/.test(fol.label), "and it's from a followed restaurant", fol.label);
  await swipeTo(p, 1);
  await timeToPlay(p, Date.now());
  const fol1 = await activeInfo(p);
  at = Date.now();
  await p.getByTestId("tab-foryou").click();
  const tb = await timeToPlay(p, at);
  const fy = await activeInfo(p);
  check(fy.index === forYou.index && fy.label === forYou.label, "For you returns to the reel you were on", { forYou, fy });
  check(tb >= 0 && tb < 700, `and plays at once (${tb} ms)`, tb);
  at = Date.now();
  await p.getByTestId("tab-following").click();
  const tf2 = await timeToPlay(p, at);
  const fol2 = await activeInfo(p);
  check(fol2.index === fol1.index && fol2.label === fol1.label && tf2 >= 0 && tf2 < 700, `Following again: same reel, plays at once (${tf2} ms)`, { fol1, fol2, tf2 });

  console.log("\nFollowing → restaurant → Back");
  await p.locator("section[data-active='true'] a[href^='/r/']").first().click();
  await p.waitForURL(/\/r\//);
  await p.waitForTimeout(800);
  at = Date.now();
  await p.locator("[data-testid=back-button]:visible").click();
  await p.waitForURL((u) => u.pathname === "/");
  await p.locator("section[data-active='true']").waitFor();
  const fol3 = await activeInfo(p);
  const sel = await p.getByTestId("tab-following").getAttribute("aria-selected");
  check(sel === "true" && fol3.label === fol2.label, "back on the Following tab, same reel", { sel, fol3 });
  const tf3 = await timeToPlay(p, at);
  check(tf3 >= 0 && tf3 < 1500, `plays at once (${tf3} ms)`, tf3);

  console.log("\nFresh feed → Following straight away → swipe");
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.reload({ waitUntil: "load" });
  check((await timeToPlay(p, Date.now(), 20000)) >= 0 && !errors.length, "a fresh load still starts normally", errors);
  await p.waitForTimeout(6000);
  const fyFirst = (await activeInfo(p)).label;
  at = Date.now();
  await p.getByTestId("tab-following").click();
  const tfs = await timeToPlay(p, at);
  const folFirst = (await activeInfo(p)).label;
  check(tfs >= 0 && tfs < 700, `Following plays at once (${tfs} ms; ${fyFirst === folFirst ? "same" : "different"} first reel than For you)`, tfs < 0 ? await vstate() : tfs);
  const counts = await p.evaluate(() => document.querySelectorAll("section[data-index]").length);
  await swipeTo(p, 1);
  const sw = await activeInfo(p);
  const ts = await timeToPlay(p, Date.now());
  const playingOne = await p.evaluate(() => [...document.querySelectorAll("section[data-index] video")].filter((v) => !v.paused).map((v) => v.closest("section").dataset.index));
  // (a reel two ahead may play silently for a moment: that's how iPhones are made to preload it)
  check(sw.index === 1 && ts >= 0 && playingOne.includes("1") && !playingOne.includes("0"), `swiping in Following moves to the next reel, which plays, and the previous one stops (${counts} reels)`, { sw, ts, playingOne });
  console.log("\nRestaurant reels grid: no back-and-forth loop");
  const settle = (pg) => pg.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
  const path = (pg) => new URL(pg.url()).pathname;
  const q = await ctx.newPage(); // a fresh tab, as if the restaurant page was opened directly
  await q.addLocatorHandler(q.getByRole("dialog", { name: "How was your order?" }), async () => q.getByRole("button", { name: "Not now" }).click({ timeout: 3000 }).catch(() => {}));
  const openGridReel = async () => {
    // A tap while the page is still starting up can be missed: tap again (as a person would).
    for (let i = 0; i < 3 && !/\/reels\//.test(q.url()); i++) {
      await q.locator("[role=tab]:visible", { hasText: "Reels" }).first().click();
      await q.locator("a[href*='/reels/']:visible").first().click();
      await q.waitForURL(/\/r\/burger-house\/reels\//, { timeout: 5000 }).catch(() => {});
    }
    await q.waitForURL(/\/r\/burger-house\/reels\//);
    await settle(q);
  };
  await q.goto("/r/burger-house", { waitUntil: "load" }); await settle(q);
  await openGridReel();
  // the restaurant photo on the reel goes back to the page it came from (no new copy)
  await q.locator("section[data-active='true'] a[href='/r/burger-house']").first().click();
  await q.waitForURL((u) => u.pathname === "/r/burger-house");
  await settle(q);
  await q.locator("[data-testid=back-button]:visible").click();
  await q.waitForURL((u) => u.pathname !== "/r/burger-house", { timeout: 10000 }).catch(() => {});
  check(path(q) === "/restaurants", "reel → restaurant photo → restaurant → Back leaves the restaurant (no loop back to the reel)", path(q));
  await q.goto("/r/burger-house", { waitUntil: "load" }); await settle(q);
  await openGridReel();
  await q.getByTestId("reel-back").click();
  await q.waitForURL((u) => u.pathname === "/r/burger-house");
  await settle(q);
  await q.locator("[data-testid=back-button]:visible").click();
  await q.waitForURL((u) => u.pathname !== "/r/burger-house", { timeout: 10000 }).catch(() => {});
  check(path(q) !== "/r/burger-house" && !path(q).includes("/reels/"), "reel → reel's Back → restaurant → Back doesn't return to the reel", path(q));
  // From the home feed: reel → restaurant → grid reel → photo → Back → the home reel you started on
  await q.goto("/", { waitUntil: "load" }); await settle(q);
  const feeds = await q.waitForFunction(() => document.querySelectorAll("section[data-active='true']").length === 1, null, { timeout: 15000 }).then(() => 1, () => q.evaluate(() => document.querySelectorAll("section[data-active='true']").length));
  check(feeds === 1, "one feed on the page once loaded", feeds);
  await swipeTo(q, 1);
  const start = await activeInfo(q);
  const slugHref = await q.locator("section[data-active='true'] a[href^='/r/']").first().getAttribute("href");
  await q.locator("section[data-active='true'] a[href^='/r/']").first().click();
  await q.waitForURL((u) => u.pathname === slugHref); await settle(q);
  await q.locator("[role=tab]:visible", { hasText: "Reels" }).first().click();
  await q.locator("a[href*='/reels/']:visible").first().click();
  await q.waitForURL(/\/reels\//); await settle(q); await q.locator("section[data-active='true']").first().waitFor();
  await q.locator(`section[data-active='true'] a[href='${slugHref}']`).first().click();
  await q.waitForURL((u) => u.pathname === slugHref); await settle(q);
  await q.locator("[data-testid=back-button]:visible").click();
  await q.waitForURL((u) => u.pathname === "/", { timeout: 10000 }).catch(() => {});
  await settle(q);
  const end = await activeInfo(q);
  check(path(q) === "/" && end.label === start.label, "home reel → restaurant → its reel → photo → Back returns to the home reel you started on", { path: path(q), start: start.label, end: end.label });
  await q.close();

  await b.close(); await db.$disconnect();
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
