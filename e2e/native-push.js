// The numnum store app's notifications, in a browser that pretends to be the app: "NumnumApp" in the
// user agent and a fake Capacitor PushNotifications plugin standing in for the phone.
//   BASE_URL=http://localhost:3000 node e2e/native-push.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = new PrismaClient();
let fails = 0;
const check = (c, m, x) => {
  console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — " + JSON.stringify(x)}`);
  if (!c) fails++;
};

// The phone, behaving like the real Capacitor bridge: addListener hands back the handle directly
// (not a promise). mode: "ok" answers normally, "silent" never sends a notification address,
// "refuse" fails the permission request.
const fakePhone = (platform, permission, mode = "ok") => `
  window.__nn = { permission: sessionStorage.getItem("nn-perm") || ${JSON.stringify(permission)}, channels: [], listeners: {} };
  const on = (ev, cb) => { (window.__nn.listeners[ev] ||= []).push(cb); return { remove: async () => { window.__nn.listeners[ev] = (window.__nn.listeners[ev] || []).filter((x) => x !== cb); } }; };
  const fire = (ev, v) => (window.__nn.listeners[ev] || []).forEach((cb) => cb(v));
  window.Capacitor = { getPlatform: () => ${JSON.stringify(platform)}, Plugins: { PushNotifications: {
    checkPermissions: async () => ({ receive: window.__nn.permission }),
    requestPermissions: async () => {
      if (${JSON.stringify(mode)} === "refuse") throw new Error("Notifications are not allowed for this application");
      if (window.__nn.permission !== "denied") window.__nn.permission = "granted";
      sessionStorage.setItem("nn-perm", window.__nn.permission);
      return { receive: window.__nn.permission };
    },
    register: async () => { if (${JSON.stringify(mode)} === "ok") setTimeout(() => fire("registration", { value: ${JSON.stringify(platform === "ios" ? "ab".repeat(32) : "fcm-test-token:APA91b_e2e-1")} }), 50); },
    addListener: on,
    createChannel: async (c) => { window.__nn.channels.push(c); },
  } } };
  window.__nnTap = (url) => fire("pushNotificationActionPerformed", { notification: { data: { url } } });
`;

async function appContext(b, platform, permission = "prompt", mode = "ok") {
  const ua = (platform === "ios" ? devices["iPhone 13"] : devices["Pixel 7"]).userAgent + " NumnumApp/1";
  const ctx = await b.newContext({ ...(platform === "ios" ? devices["iPhone 13"] : devices["Pixel 7"]), userAgent: ua, baseURL: BASE });
  await ctx.addInitScript(fakePhone(platform, permission, mode));
  return ctx;
}
async function login(ctx, email, pw) {
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.fill("#email", email);
  await p.fill("#password", pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), p.getByRole("button", { name: "Log in" }).click()]);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" } });
  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: "native:" } } });

  // ── Restaurant on Android: the dashboard asks for notifications, no "add to home screen" step
  const actx = await appContext(b, "android");
  const p = await login(actx, "owner@burgerhouse.demo", "demo1234");
  await p.goto("/dashboard/orders?gate=preview", { waitUntil: "networkidle" });
  await p.getByRole("heading", { name: "Allow notifications for new orders" }).waitFor({ timeout: 10000 });
  check(true, "app: restaurant dashboard asks to allow notifications");
  check(!(await p.getByText("1. Add to home screen").count()), "no 'Add to home screen' step inside the app");
  const channels = await p.evaluate(() => window.__nn.channels);
  check(channels.some((c) => c.id === "orders" && c.importance === 5), "Android 'Orders & updates' channel created with high importance", channels);
  await p.getByRole("button", { name: "Turn on order notifications" }).click();
  await p.getByRole("heading", { name: "Allow notifications for new orders" }).waitFor({ state: "detached", timeout: 10000 });
  check(true, "after allowing, the dashboard opens");
  await p.waitForTimeout(500);
  const android = await db.pushSubscription.findFirst({ where: { endpoint: "native:android:fcm-test-token:APA91b_e2e-1" } });
  check(android?.userId === owner.id, "the phone is saved for the restaurant owner (Android)", android);

  // Tapping a notification opens its page
  await p.evaluate(() => window.__nnTap("/dashboard/orders?ref=NN-TEST"));
  await p.waitForURL(/ref=NN-TEST/, { timeout: 10000 });
  check(true, "tapping a notification opens the order");
  await p.evaluate(() => window.__nnTap("https://evil.example/phish"));
  await p.waitForTimeout(1500);
  check(new URL(p.url()).host === new URL(BASE).host, "a link to another site is not followed", p.url());

  // Reopening the app re-links the phone to whoever is signed in
  await db.pushSubscription.update({ where: { id: android.id }, data: { userId: null } });
  await p.goto("/dashboard/orders?gate=preview", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  check((await db.pushSubscription.findUnique({ where: { id: android.id } }))?.userId === owner.id, "reopening the app re-links the phone to the signed-in account");

  // ── Blocked in the phone's settings: tells the restaurant where to turn them on
  const bctx = await appContext(b, "ios", "denied");
  const bp = await login(bctx, "owner@burgerhouse.demo", "demo1234");
  await bp.goto("/dashboard/orders?gate=preview", { waitUntil: "networkidle" });
  await bp.getByRole("heading", { name: "Notifications are turned off" }).waitFor({ timeout: 10000 });
  check((await bp.locator("body").innerText()).includes("Settings → Notifications → numnum → Allow Notifications"), "blocked: shows the iPhone settings path with the app's name 'numnum'");

  // ── Customer on iPhone: account page offers order notifications
  const cctx = await appContext(b, "ios");
  const c = await login(cctx, "customer@numnum.demo", "demo1234");
  await c.goto("/account", { waitUntil: "networkidle" });
  // The demo customer has a delivered order: close its "How was your order?" popup first.
  const rate = c.getByRole("dialog", { name: "How was your order?" });
  if (await rate.waitFor({ timeout: 2500 }).then(() => true, () => false)) await rate.getByRole("button", { name: /Close|Not now/ }).first().click().catch(() => {});
  const btn = c.getByRole("button", { name: /Turn on/ }).first();
  check(await btn.isVisible().catch(() => false), "app: customer account offers order notifications");
  await btn.click().catch(() => {});
  await c.getByText("Order notifications are on for this device").waitFor({ timeout: 10000 }).catch(() => {});
  // "Send me a test notification" shows what the server / Apple answered
  await c.getByTestId("send-test-notification").click();
  const answer = await c.getByText(/Sent\. It should arrive|couldn't be sent/).first().innerText({ timeout: 25000 }).catch(() => "");
  const reason = await c.locator("text=/\\(.+\\)/").last().innerText().catch(() => "");
  check(/couldn't be sent/.test(answer) && /APNS_KEY/.test(reason), `test notification: the server's answer is shown (${reason || answer})`);
  const ios = await db.pushSubscription.findFirst({ where: { endpoint: `native:ios:${"ab".repeat(32)}` }, include: { user: true } });
  check(ios?.user?.email === "customer@numnum.demo", "the iPhone is saved for the customer", ios);

  // ── Things going wrong on the phone: the button always stops and says why
  for (const [mode, what, maxS] of [["silent", "the phone never sends its notification address", 30], ["refuse", "the phone refuses the permission request", 5]]) {
    const sctx = await appContext(b, "ios", "prompt", mode);
    const sp = await login(sctx, "owner@forno.demo", "demo1234");
    await sp.goto("/account", { waitUntil: "networkidle" });
    const rate = sp.getByRole("dialog", { name: "How was your order?" });
    if (await rate.waitFor({ timeout: 1500 }).then(() => true, () => false)) await rate.getByRole("button", { name: /Close|Not now/ }).first().click().catch(() => {});
    const t0 = Date.now();
    await sp.getByRole("button", { name: "Turn on notifications" }).click();
    const shown = await sp.getByText("Couldn't turn on notifications").waitFor({ timeout: maxS * 1000 }).then(() => true, () => false);
    const secs = Math.round((Date.now() - t0) / 1000);
    check(shown, `${what}: the spinner stops (after ${secs} s) with a message`);
    check(await sp.getByRole("button", { name: "Try again" }).isEnabled().catch(() => false), `${what}: 'Try again' is offered`);
    const reason = await sp.locator("text=/\\(.+\\)/").last().innerText().catch(() => "");
    check(reason.length > 3, `${what}: the reason is shown: ${reason}`);
    await sctx.close();
  }

  // ── The API refuses junk tokens
  const bad = await c.request.post("/api/push", { data: { native: { platform: "ios", token: "<script>" } } });
  check(bad.status() === 400, "the API refuses an invalid app token", bad.status());

  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: "native:" } } });
  await b.close();
  await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
