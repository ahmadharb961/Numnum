// App Store / Google Play requirements: block content (restaurant, reviewer) and delete my account.
// (Terms acceptance at sign-up is checked in customer-strict.js.)
//   BASE_URL=http://localhost:3000 node e2e/store-requirements.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || require("os").tmpdir();
const db = new PrismaClient();
let fails = 0;
const check = (c, m, x) => {
  console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — " + JSON.stringify(x)}`);
  if (!c) fails++;
};

async function register(ctx, email) {
  const p = await ctx.newPage();
  await p.goto("/account/register?next=/account", { waitUntil: "networkidle" });
  await p.fill("#name", "Store Tester");
  await p.fill("#email", email);
  await p.fill("#phone", "71 333 444");
  await p.fill("#password", "storepass1");
  await p.check('[data-testid="customer-terms"]');
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/account/register"), { timeout: 20000 }), p.getByRole("button", { name: "Create account" }).click()]);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const email = `store${Date.now()}@test.lb`;
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const p = await register(ctx, email);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const bh = await db.restaurant.findUniqueOrThrow({ where: { slug: "burger-house" } });
  const reel = await db.reel.findFirstOrThrow({ where: { restaurantId: bh.id, status: "READY", visibility: "PUBLISHED" } });

  // ── Block a restaurant from a reel's Report sheet
  await p.goto(`/reel/${reel.id}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Report this reel" }).first().click();
  await p.getByRole("dialog", { name: "Report content" }).waitFor();
  check(await p.getByTestId("report-also-block").isVisible(), "Report sheet offers 'Also hide content from Burger House'");
  await p.getByRole("button", { name: "Offensive or inappropriate" }).click();
  await p.screenshot({ path: `${SHOTS}/store-report-block.png` });
  await p.getByRole("button", { name: "Submit report" }).click();
  await p.getByText("is now hidden for you").waitFor({ timeout: 10000 }).catch(() => {});
  check(!!(await db.userBlock.findFirst({ where: { userId: user.id, restaurantId: bh.id } })), "Burger House blocked");
  check((await db.report.count({ where: { reporterKey: `u:${user.id}` } })) === 1, "the report was sent too");

  await p.goto("/restaurants", { waitUntil: "networkidle" });
  check(!(await p.locator('a[href="/r/burger-house"]').count()), "Burger House is gone from the restaurant list");
  await p.goto("/explore?q=burger", { waitUntil: "networkidle" });
  check(!(await p.locator("body").innerText()).includes("Burger House"), "and from search results");
  await p.goto("/r/burger-house", { waitUntil: "networkidle" });
  check(await p.getByTestId("blocked-notice").isVisible(), "its page says 'You blocked Burger House'");
  await p.screenshot({ path: `${SHOTS}/store-blocked-notice.png` });

  // ── Unblock from Account → Blocked
  await p.goto("/account/blocked", { waitUntil: "networkidle" });
  check((await p.getByTestId("blocked-list").innerText()).includes("Burger House"), "Account → Blocked lists Burger House");
  await p.getByRole("button", { name: "Unblock" }).first().click();
  await p.waitForTimeout(800);
  await p.goto("/r/burger-house", { waitUntil: "networkidle" });
  check(!(await p.getByTestId("blocked-notice").count()) && (await p.locator("h1").first().innerText()).includes("Burger House"), "after unblocking, the page is back");

  // ── Hide a reviewer
  const rv = await db.restaurantReview.findFirst({ where: { restaurantId: bh.id, status: "VISIBLE", NOT: { userId: user.id } }, include: { user: true } });
  if (rv) {
    await p.goto("/r/burger-house#reviews", { waitUntil: "networkidle" });
    const before = await p.locator("body").innerText();
    const first = rv.user.name.split(" ")[0];
    check(before.includes(rv.user.name) || before.includes(first), `review by ${rv.user.name} is visible`);
    const item = p.locator("li", { hasText: rv.body ?? rv.user.name }).first();
    await item.getByRole("button", { name: /^Report$/ }).click();
    await p.getByRole("button", { name: "Spam" }).click();
    await p.getByRole("button", { name: "Submit report" }).click();
    await p.waitForTimeout(1500);
    check(!!(await db.userBlock.findFirst({ where: { userId: user.id, blockedUserId: rv.userId } })), "reviewer blocked");
    await p.goto("/r/burger-house#reviews", { waitUntil: "networkidle" });
    const shown = await p.locator("li", { hasText: rv.body ?? "§§" }).count();
    check(!rv.body || shown === 0, "their reviews are hidden");
  } else check(false, "demo data has a review to hide");

  // ── Delete my account
  await p.goto("/account", { waitUntil: "networkidle" });
  await p.getByTestId("delete-account-link").click();
  await p.waitForURL(/\/account\/delete/);
  await p.screenshot({ path: `${SHOTS}/store-delete-account.png`, fullPage: true });
  await p.fill("#del-password", "wrongpass1");
  await p.check('input[name="confirm"]');
  await p.getByRole("button", { name: "Delete my account permanently" }).click();
  await p.waitForTimeout(1200);
  check((await p.getByText("Incorrect password").count()) > 0, "a wrong password is refused");
  await p.fill("#del-password", "storepass1");
  await p.check('input[name="confirm"]');
  await Promise.all([p.waitForURL((u) => u.pathname === "/", { timeout: 20000 }), p.getByRole("button", { name: "Delete my account permanently" }).click()]);
  check((await p.getByText("Your account was deleted").count()) > 0, "home page confirms the account was deleted");
  check(!(await db.user.findUnique({ where: { email } })), "the account is gone from the database");
  check((await db.userBlock.count({ where: { userId: user.id } })) === 0, "its blocks are gone too");
  const lp = await ctx.newPage();
  await lp.goto("/login");
  await lp.fill("#email", email);
  await lp.fill("#password", "storepass1");
  await lp.getByRole("button", { name: "Log in" }).click();
  await lp.waitForTimeout(1500);
  check(new URL(lp.url()).pathname.startsWith("/login"), "logging in with the old password no longer works");

  await b.close();
  await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
