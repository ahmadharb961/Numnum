// The store apps are counted: a phone running the numnum app reports once a day, the admin sees
// installs per platform. A normal browser never counts.
//   BASE_URL=http://localhost:3000 node e2e/app-installs.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});

(async () => {
  const db = new PrismaClient();
  const b = await chromium.launch();
  const errors = [];
  const made = [];
  async function phone(platform, ip) {
    const dev = devices[platform === "ios" ? "iPhone 13" : "Pixel 7"];
    const ctx = await b.newContext({ ...dev, userAgent: `${dev.userAgent} NumnumApp/1`, baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip } });
    // What the store app's native shell provides.
    await ctx.addInitScript((pf) => { window.Capacitor = { getPlatform: () => pf, Plugins: {} }; }, platform);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    return p;
  }
  const idOf = (p) => p.evaluate(() => localStorage.getItem("nn_app_device"));
  const waitRow = async (id) => { for (let i = 0; i < 20 && id; i++) { const r = await db.appDevice.findUnique({ where: { id } }); if (r) return r; await new Promise((r) => setTimeout(r, 500)); } return null; };

  console.log("\nAndroid app");
  const a = await phone("android", "10.4.8.1");
  await a.goto("/", { waitUntil: "load" });
  await a.waitForFunction(() => localStorage.getItem("nn_app_open_day"), null, { timeout: 15000 }).catch(() => {});
  const aid = await idOf(a); made.push(aid);
  const arow = await waitRow(aid);
  check(arow?.platform === "android", "opening the app counts the phone as an Android install", arow);
  await a.goto("/explore", { waitUntil: "load" }); await a.waitForTimeout(5000);
  check((await db.appDevice.findUnique({ where: { id: aid } }))?.lastSeenAt.getTime() === arow?.lastSeenAt.getTime(), "opening again the same day doesn't report again");
  await a.context().close();

  console.log("\niPhone app");
  const i = await phone("ios", "10.4.8.2");
  await i.goto("/", { waitUntil: "load" });
  await i.waitForFunction(() => localStorage.getItem("nn_app_open_day"), null, { timeout: 15000 }).catch(() => {});
  const iid = await idOf(i); made.push(iid);
  check((await waitRow(iid))?.platform === "ios", "an iPhone install");
  await i.context().close();

  console.log("\nNot the app");
  const before = await db.appDevice.count();
  const w = await (await b.newContext({ ...devices["iPhone 13"], baseURL: BASE })).newPage();
  await w.goto("/", { waitUntil: "load" }); await w.waitForTimeout(5500);
  const forged = await w.evaluate(async () => (await fetch("/api/app-open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "forged-from-a-browser-0001", platform: "ios" }) })).status);
  check((await db.appDevice.count()) === before && forged === 204, "a phone browser isn't counted, even posting directly");
  await w.context().close();

  console.log("\nAdmin → Overview");
  const ad = await (await b.newContext({ viewport: { width: 1360, height: 900 }, baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.4.8.3" } })).newPage();
  await ad.goto("/login"); await ad.fill("#email", process.env.ADMIN_EMAIL || "admin@numnum.app"); await ad.fill("#password", process.env.ADMIN_PASSWORD || "admin1234");
  await ad.locator("form button[type=submit]").click(); await ad.waitForURL((u) => !u.pathname.startsWith("/login"));
  await ad.goto("/admin", { waitUntil: "load" }); await settle(ad);
  const stats = await ad.getByTestId("app-stats").innerText();
  const androidN = await db.appDevice.count({ where: { platform: "android" } });
  const iosN = await db.appDevice.count({ where: { platform: "ios" } });
  check(new RegExp(`Android app installs\\s+${androidN}\\b`, "i").test(stats) && new RegExp(`iPhone app installs\\s+${iosN}\\b`, "i").test(stats), `shows installs per platform (Android ${androidN}, iPhone ${iosN})`, stats);
  check(/App notifications on/i.test(stats) && /Logged-in app users/i.test(stats), "and notifications on and logged-in app users");
  await ad.screenshot({ path: `${process.env.SHOTS || "/tmp"}/admin-app-stats.png`, clip: await ad.getByTestId("app-stats").boundingBox().then((bb) => ({ x: 0, y: Math.max(0, bb.y - 40), width: 1360, height: bb.height + 110 })) });
  await ad.context().close();

  await db.appDevice.deleteMany({ where: { id: { in: made.filter(Boolean) } } });
  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
