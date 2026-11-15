// Following updates everywhere at once: follow on a reel, open the restaurant (no reload): it shows
// Following and the new count; unfollow there, go back: the reel shows + again.
//   BASE_URL=http://localhost:3000 node e2e/follow-sync.js
// The exact steps from the report: follow on a reel → tap the restaurant → page shows Following at once.
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
(async () => {
  const db = new PrismaClient();
  const cust = await db.user.findUnique({ where: { email: "customer@numnum.demo" } });
  const bh = await db.restaurant.findUnique({ where: { slug: "burger-house" } });
  await db.restaurantFollow.deleteMany({ where: { userId: cust.id, restaurantId: bh.id } });
  await db.restaurant.update({ where: { id: bh.id }, data: { followerCount: await db.restaurantFollow.count({ where: { restaurantId: bh.id } }) } });
  const before = (await db.restaurant.findUnique({ where: { id: bh.id } })).followerCount;
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices["iPhone 13"], baseURL: process.env.BASE_URL || "http://localhost:3000" })).newPage();
  await p.addLocatorHandler(p.getByRole("dialog", { name: "How was your order?" }), async () => p.getByRole("button", { name: "Not now" }).click());
  await p.goto("/login"); await p.fill("#email", "customer@numnum.demo"); await p.fill("#password", "demo1234");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Log in" }).click()]);
  // Home feed, scroll to a Burger House reel, wait long enough for its page to be preloaded
  await p.goto("/", { waitUntil: "load" });
  await p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 12; i++) {
    const lbl = await p.evaluate(() => document.querySelector("section[data-active='true']")?.getAttribute("aria-label") || "");
    if (lbl.includes("Burger House")) break;
    await p.evaluate(() => { const s = document.querySelector("section[data-active='true']"); s.parentElement.scrollBy({ top: s.clientHeight, behavior: "instant" }); }); await p.waitForTimeout(700);
  }
  await p.waitForTimeout(3500); // the restaurant page gets preloaded in the background
  const active = p.locator("section[data-active='true']");
  await active.getByTestId("follow-button").click();
  await p.waitForTimeout(1200);
  check((await db.restaurant.findUnique({ where: { id: bh.id } })).followerCount === before + 1, "follow saved");
  // Tap the restaurant's picture (client-side navigation, no reload)
  await active.locator('a[aria-label^="Open Burger House"]').click();
  await p.waitForURL(/\/r\/burger-house/);
  await p.getByTestId("restaurant-follow").waitFor();
  check((await p.getByTestId("restaurant-follow").innerText()).includes("Following"), "restaurant page shows Following straight away", await p.getByTestId("restaurant-follow").innerText());
  check((await p.getByTestId("follower-count").innerText()).includes(String(before + 1)), `and ${before + 1} follower(s)`, await p.getByTestId("follower-count").innerText());
  // Unfollow on the page, go back: the reel shows + again
  await p.getByTestId("restaurant-follow").click();
  await p.waitForTimeout(1200);
  check((await p.getByTestId("restaurant-follow").innerText()).includes("Follow") && !(await p.getByTestId("restaurant-follow").innerText()).includes("Following"), "unfollow on the page → Follow");
  check((await p.getByTestId("follower-count").innerText()).includes(String(before)), `count back to ${before}`, await p.getByTestId("follower-count").innerText());
  await p.goBack(); await p.waitForTimeout(1200);
  check((await p.locator("section[data-active='true'] [data-testid=follow-button]").count()) === 1, "back on the reel: the + is there again");
  // ── Account → Following: the list of restaurants they follow ──
  const mh = await db.restaurant.findUnique({ where: { slug: "manousheh-corner" } });
  await db.restaurantFollow.deleteMany({ where: { userId: cust.id } });
  for (const r of [bh, mh]) await db.restaurantFollow.create({ data: { userId: cust.id, restaurantId: r.id } });
  await db.deal.deleteMany({ where: { restaurantId: mh.id } });
  await db.deal.create({ data: { restaurantId: mh.id, kind: "PERCENT_OFF", percent: 15 } });
  // Created straight in the database (not from the dashboard, which clears it at once): let the
  // 15 s deal-badge cache expire.
  await new Promise((r) => setTimeout(r, 16000));
  await p.goto("/account", { waitUntil: "load" });
  check((await p.getByRole("link", { name: /Following/ }).innerText()).includes("2 restaurants"), "Account shows Following · 2 restaurants", await p.getByRole("link", { name: /Following/ }).innerText());
  // The review popup (from an earlier test's delivered order) can open as the link is tapped: tap again.
  for (let i = 0; i < 3 && !p.url().includes("/account/following"); i++) {
    await p.getByRole("link", { name: /Following/ }).click();
    await p.waitForURL(/\/account\/following/, { timeout: 5000 }).catch(() => {});
  }
  await p.waitForURL(/\/account\/following/);
  await p.getByTestId("following-list").waitFor();
  const rows = await p.getByTestId("following-row").allInnerTexts();
  check(rows.length === 2 && rows.some((r) => r.includes("Burger House")) && rows.some((r) => r.includes("Manousheh Corner")), "the list shows both restaurants", rows);
  check(rows.some((r) => r.includes("Manousheh Corner") && r.includes("15% off")), "with the restaurant's deal", rows);
  const bhRow = p.getByTestId("following-row").filter({ hasText: "Burger House" });
  await bhRow.getByTestId("following-toggle").click();
  await p.waitForTimeout(1200);
  check((await bhRow.getByTestId("following-toggle").innerText()).trim() === "Follow", "Unfollow there: the button turns into Follow (so a mis-tap can be undone)");
  check(!(await db.restaurantFollow.findUnique({ where: { userId_restaurantId: { userId: cust.id, restaurantId: bh.id } } })), "unfollow saved");
  await bhRow.locator("a").first().click();
  await p.waitForURL(/\/r\/burger-house/);
  check((await p.getByTestId("restaurant-follow").innerText()).trim() === "Follow", "its page shows Follow at once");
  await p.goto("/account", { waitUntil: "load" });
  check((await p.getByRole("link", { name: /Following/ }).innerText()).includes("1 restaurant"), "Account now shows 1 restaurant", await p.getByRole("link", { name: /Following/ }).innerText());
  await db.restaurantFollow.deleteMany({ where: { userId: cust.id } });
  await p.goto("/account/following", { waitUntil: "load" });
  await p.locator("[data-testid=following-list-empty]:visible").first().waitFor({ timeout: 10000 }).catch(() => {});
  check((await p.locator("[data-testid=following-list-empty]:visible").count()) === 1, "following nobody: a helpful empty screen with Discover / Browse buttons");
  await db.deal.deleteMany({ where: { restaurantId: mh.id } });

  await b.close(); await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed"); process.exit(fails ? 1 : 0);
})();
