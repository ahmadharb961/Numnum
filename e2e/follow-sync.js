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
  await b.close(); await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed"); process.exit(fails ? 1 : 0);
})();
