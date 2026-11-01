// Admin push notification with a photo to restaurants → saved in each restaurant's Notifications,
// tapping opens the full message with the photo, only the audience can open it.
//   BASE_URL=http://localhost:3000 node e2e/broadcast.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || require("os").tmpdir();
const db = new PrismaClient();
let fails = 0;
const check = (c, m, x) => {
  console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — " + JSON.stringify(x)}`);
  if (!c) fails++;
};
async function login(ctx, email, pw) {
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), p.getByRole("button", { name: "Log in" }).click()]);
  return p;
}

(async () => {
  // The owner needs a device with notifications on to be in the audience (fake endpoint: delivery fails, that's fine).
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" } });
  const bh = await db.restaurant.findUniqueOrThrow({ where: { slug: "burger-house" } });
  await db.pushSubscription.upsert({ where: { endpoint: "https://push.test/e2e-owner" }, create: { endpoint: "https://push.test/e2e-owner", p256dh: "x", auth: "x", userId: owner.id }, update: { userId: owner.id } });
  const title = `Ramadan offer ${Date.now() % 100000}`;

  const b = await chromium.launch();
  const actx = await b.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const a = await login(actx, process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234");
  await a.goto("/admin/push", { waitUntil: "networkidle" });
  await a.getByRole("button", { name: /^All restaurants/ }).click();
  await a.fill("#bc-title", title);
  await a.fill("#bc-body", "Boost your reels this month: free promotion for every new reel.");
  await a.locator('input[type="file"]').setInputFiles(path.join(__dirname, "../public/og.png"));
  await a.locator("form img, .card img").first().waitFor({ timeout: 20000 });
  a.once("dialog", (d) => d.accept());
  await a.getByRole("button", { name: /Send notification/ }).click();
  await a.waitForTimeout(2500);
  const row = await db.pushBroadcast.findFirst({ where: { title }, orderBy: { createdAt: "desc" } });
  check(!!row && !!row.imageUrl, "admin sent the broadcast with a photo", row);
  if (!row) process.exit(1);

  const n = await db.notification.findFirst({ where: { restaurantId: bh.id, link: `/m/${row.id}` } });
  check(!!n && n.imageUrl === row.imageUrl && n.readAt === null, "saved in Burger House's notifications with the photo, unread", n);

  // The restaurant (phone) sees it in Notifications and opens it
  const octx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const o = await login(octx, "owner@burgerhouse.demo", "demo1234");
  await o.goto("/dashboard/notifications", { waitUntil: "networkidle" });
  const item = o.locator(`a[href="/m/${row.id}"]`);
  check((await item.count()) > 0 && (await item.locator("img").count()) > 0, "listed in the dashboard with its photo");
  check((await item.innerText()).includes(title), "shows the title in the list");
  await o.screenshot({ path: `${SHOTS}/broadcast-list.png` });
  await item.click();
  await o.waitForURL(new RegExp(`/m/${row.id}`));
  const msg = o.getByTestId("broadcast-message");
  await msg.waitFor();
  check((await msg.innerText()).includes(title) && (await msg.innerText()).includes("free promotion"), "message page shows title and text");
  const img = msg.locator("img");
  check((await img.count()) === 1 && (await img.evaluate((el) => el.complete && el.naturalWidth > 0)), "message page shows the full photo");
  await o.screenshot({ path: `${SHOTS}/broadcast-message.png`, fullPage: true });
  check(!!(await db.notification.findUnique({ where: { id: n.id } })).readAt, "opening it marks it read");

  // A tap while the app is open: the service worker asks the page to go to the message
  await o.goto("/dashboard/orders", { waitUntil: "networkidle" });
  await o.evaluate((url) => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "nn:open", url } })), `${BASE}/m/${row.id}`);
  await o.waitForURL(new RegExp(`/m/${row.id}`), { timeout: 10000 }).catch(() => {});
  check(new URL(o.url()).pathname === `/m/${row.id}`, "tap while the app is open → the message opens", o.url());

  // Only the audience can open it
  const cctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  const c = await login(cctx, "customer@numnum.demo", "demo1234");
  await c.goto(`/m/${row.id}`, { waitUntil: "networkidle" });
  check((await c.getByTestId("broadcast-message").count()) === 0 && (await c.getByText("This message isn't for this account").count()) > 0, "a customer can't open a restaurants-only message");
  const g = await (await b.newContext({ baseURL: BASE })).newPage();
  await g.goto(`/m/${row.id}`, { waitUntil: "networkidle" });
  check((await g.getByTestId("broadcast-message").count()) === 0, "a guest can't open it either");

  await db.pushSubscription.deleteMany({ where: { endpoint: "https://push.test/e2e-owner" } });
  await b.close();
  await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
