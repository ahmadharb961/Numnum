// Store links (Admin → Settings → Store apps): until they're set, phones see "add to home screen";
// once set, Android browsers get Google Play and iPhone browsers the App Store. The app itself and
// computers are unaffected.
//   BASE_URL=http://localhost:3000 node e2e/store-links.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = new PrismaClient();
const PLAY = "https://play.google.com/store/apps/details?id=me.numnum.app";
const APPLE = "https://apps.apple.com/app/id6830306966";
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
// The restaurant dashboard on a phone browser shows the install step (?gate=preview: test browsers are skipped otherwise).
async function gate(b, device, extraUA = "") {
  const d = devices[device];
  const ctx = await b.newContext({ ...d, userAgent: d.userAgent + extraUA, baseURL: BASE });
  const p = await login(ctx, "owner@burgerhouse.demo", "demo1234");
  await p.goto("/dashboard/orders?gate=preview", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  return { ctx, p, text: await p.locator("body").innerText(), store: await p.getByTestId("store-button").getAttribute("href").catch(() => null) };
}

(async () => {
  const b = await chromium.launch();
  await db.platformSetting.deleteMany({ where: { key: "appLinks" } });

  // ── Before the app is in the stores (today)
  let g = await gate(b, "Pixel 7");
  check(g.text.includes("Add numnum to your home screen to receive orders") && !g.store, "no store links yet: Android shows 'add to home screen', no store button", g.store);
  await g.ctx.close();

  // ── Admin fills in the store links
  const actx = await b.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const a = await login(actx, process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234");
  await a.goto("/admin/settings", { waitUntil: "networkidle" });
  await a.locator("#app-link-android").fill("https://evil.example/numnum.apk");
  await a.getByTestId("save-app-links").click();
  await a.getByText("must be an https://play.google.com").first().waitFor({ timeout: 8000 }).catch(() => {});
  check((await a.getByText("must be an https://play.google.com").count()) > 0, "a link that isn't Google Play is refused");
  await a.locator("#app-link-android").fill(PLAY);
  await a.locator("#app-link-ios").fill(APPLE);
  await a.getByTestId("save-app-links").click();
  await a.waitForTimeout(1500);
  const saved = (await db.platformSetting.findUnique({ where: { key: "appLinks" } }))?.value;
  check(saved?.android === PLAY && saved?.ios === APPLE, "both store links saved", saved);
  await a.screenshot({ path: `${process.env.SHOTS || require("os").tmpdir()}/store-links-admin.png` });

  // ── Android browser: Google Play
  g = await gate(b, "Pixel 7");
  check(g.store === PLAY, "Android browser: the restaurant is sent to Google Play", g.store);
  check(g.text.includes("Get the numnum app to receive orders") && g.text.includes("1. Get the app") && !g.text.includes("Add numnum to your home screen"), "Android browser: the screen says 'Get the numnum app', not 'add to home screen'");
  check(g.text.includes("Google Play") && /get it on/i.test(g.text), "Android: 'Get it on Google Play' button");
  await g.p.screenshot({ path: `${process.env.SHOTS || require("os").tmpdir()}/store-links-android.png` });
  await g.ctx.close();

  // ── iPhone browser: App Store
  g = await gate(b, "iPhone 13");
  check(g.store === APPLE, "iPhone browser: sent to the App Store", g.store);
  check(g.text.includes("App Store") && /download on the/i.test(g.text), "iPhone: 'Download on the App Store' button");
  await g.ctx.close();

  // ── Inside the numnum app: never sent to a store
  g = await gate(b, "Pixel 7", " NumnumApp/1");
  check(!g.store && !g.text.includes("Get the numnum app"), "inside the app: no store button", g.store);
  await g.ctx.close();

  // ── Customers: the after-order sheet on Android points to Google Play too
  const cctx = await b.newContext({ ...devices["Pixel 7"], baseURL: BASE });
  const c = await login(cctx, "customer@numnum.demo", "demo1234");
  const order = await db.order.findFirst({ where: { user: { email: "customer@numnum.demo" }, status: { in: ["PLACED", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] } }, orderBy: { createdAt: "desc" } });
  if (order) {
    await c.goto(`/order/${order.reference}?t=${order.trackingToken}&placed=1&install=preview`, { waitUntil: "networkidle" });
    const sheetStore = await c.getByTestId("store-button").getAttribute("href", { timeout: 8000 }).catch(() => null);
    check(sheetStore === PLAY, "customer (Android): the after-order sheet offers Google Play", sheetStore);
    check((await c.locator("body").innerText()).includes("Get the numnum app and we'll notify you"), "customer sheet says 'Get the numnum app'");
  } else console.log("· (no active demo order: customer sheet not checked)");
  await cctx.close();

  // ── Clearing the links brings back the home-screen guide
  await db.platformSetting.deleteMany({ where: { key: "appLinks" } });
  g = await gate(b, "Pixel 7");
  check(!g.store && g.text.includes("Add numnum to your home screen"), "links cleared: back to 'add to home screen'");
  await g.ctx.close();

  await b.close();
  await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.platformSetting.deleteMany({ where: { key: "appLinks" } }).catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
