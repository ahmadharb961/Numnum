// A group order with 20 people at once: the host (on a phone) starts it, 19 friends (each their own
// device) open the link, join (some tapping Join twice) and add their meals all at the same moment,
// while everyone's screen keeps refreshing. The host sees all 20 live, checks out for everyone and
// places ONE order with all 20 meals (each friend's marked "For <name>"); every friend sees it was
// placed. No server error anywhere, no page error.
//   BASE_URL=http://localhost:3000 node e2e/group-20.js
const { chromium, devices, request } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x).slice(0, 500)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const SHOTS = process.env.SHOTS || "/tmp";
const FRIENDS = 19;

(async () => {
  const db = new PrismaClient();
  const bh = await db.restaurant.findFirstOrThrow({ where: { slug: "burger-house" } });
  // Dishes with no required choices, as the cart stores them.
  const dishes = await db.$queryRaw`SELECT m.id, m.name, m."priceCents" FROM menu_items m WHERE m."restaurantId" = ${bh.id} AND m.archived = false AND m.available = true AND NOT EXISTS (SELECT 1 FROM menu_item_customization_groups mg JOIN customization_groups g ON g.id = mg."groupId" WHERE mg."menuItemId" = m.id AND g.required = true) ORDER BY m.name`;
  const line = (d, qty) => ({ menuItemId: d.id, name: d.name, imageUrl: null, unitBaseCents: d.priceCents, unitOptionsCents: 0, quantity: qty, selections: {}, summary: [], note: null, reelId: null });
  const b = await chromium.launch();
  const errors = [];
  const fiveXX = [];

  console.log(`\nThe host starts the group (dishes used: ${dishes.map((d) => d.name).join(", ")})`);
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.20.0.1" } });
  await ctx.addCookies([{ name: "nn_lang", value: "en", url: BASE }]);
  const h = await ctx.newPage();
  h.on("pageerror", (e) => errors.push(`host: ${String(e).slice(0, 160)}`));
  h.on("response", (r) => r.status() >= 500 && fiveXX.push(`host ${r.status()} ${r.url()}`));
  // The demo customer is asked to rate a past order: "Not now", like a person would.
  await h.addLocatorHandler(h.getByRole("dialog", { name: /How was your order\?/ }), async () => h.getByRole("button", { name: /^Not now$/ }).click({ timeout: 3000 }).catch(() => {}));
  await h.goto("/login"); await h.fill("#email", "customer@numnum.demo"); await h.fill("#password", "demo1234");
  await h.locator("form button[type=submit]").click(); await h.waitForURL((u) => !u.pathname.startsWith("/login"));
  await h.evaluate(() => { localStorage.removeItem("nn_cart_v1"); localStorage.removeItem("nn_group_v1"); });
  await h.goto(`/r/${bh.slug}`, { waitUntil: "load" }); await settle(h);
  await h.getByLabel("Add Double Smash Burger").first().click();
  await h.getByRole("button", { name: /Add to cart/ }).click();
  await h.waitForTimeout(800);
  await h.goto("/cart", { waitUntil: "load" }); await settle(h);
  await h.getByTestId("start-group").click();
  await h.locator("#group-name").pressSequentially("Host");
  await h.getByTestId("create-group").click();
  await h.getByTestId("share-whatsapp").waitFor({ timeout: 10000 });
  await h.keyboard.press("Escape");
  const code = (await h.evaluate(() => JSON.parse(localStorage.getItem("nn_group_v1") || "null")))?.code;
  check(!!code, "group started, invite ready");

  console.log(`\n${FRIENDS} friends open the link, join and add their meals, all at once`);
  // Each friend is their own phone: own cookies (device), own network address.
  const friends = await Promise.all(Array.from({ length: FRIENDS }, async (_, i) => {
    const r = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.20.1.${i + 10}` } });
    return { i, name: `Friend ${i + 1}`, r, dish: dishes[i % dishes.length], qty: (i % 3) + 1 };
  }));
  const call = async (f, method, url, data) => {
    const res = await f.r.fetch(url, { method, data: data && JSON.stringify(data), headers: { "content-type": "application/json" }, failOnStatusCode: false, timeout: 30000 });
    if (res.status() >= 500) fiveXX.push(`${f.name} ${method} ${url} → ${res.status()}`);
    return res;
  };
  const t0 = Date.now();
  // Open the link (the page sets their device cookie), all at once.
  await Promise.all(friends.map((f) => call(f, "GET", `/g/${code}`)));
  // Join at once; every fourth friend taps Join twice.
  const joins = await Promise.all(friends.flatMap((f) => (f.i % 4 === 0 ? [0, 1] : [0]).map(() => call(f, "POST", `/api/group/${code}`, { action: "join", name: f.name }))));
  check(joins.every((r) => r.status() === 200), `${joins.length} join taps at once (some double): all OK`, joins.map((r) => r.status()));
  // Add meals at once, while everyone's screen polls.
  const polls = friends.map((f) => call(f, "GET", `/api/group/${code}`));
  const adds = await Promise.all(friends.map((f) => call(f, "POST", `/api/group/${code}`, { action: "lines", lines: [line(f.dish, f.qty)] })));
  await Promise.all(polls);
  check(adds.every((r) => r.status() === 200), `${FRIENDS} people adding at the same moment: all saved`, adds.map((r) => r.status()));
  // A few change their minds at once (change quantity).
  const changes = await Promise.all(friends.slice(0, 6).map((f) => call(f, "POST", `/api/group/${code}`, { action: "lines", lines: [line(f.dish, f.qty + 1)] })));
  friends.slice(0, 6).forEach((f) => (f.qty += 1));
  check(changes.every((r) => r.status() === 200), "6 people changing their meal at once: all saved");
  console.log(`  (all of that took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  const state = await (await call(friends[0], "GET", `/api/group/${code}`)).json();
  check(state.members.length === FRIENDS + 1 && new Set(state.members.map((m) => m.name)).size === FRIENDS + 1, `the group has exactly ${FRIENDS + 1} people, nobody twice`, state.members.length);
  const expectTotal = 750 + friends.reduce((n, f) => n + f.dish.priceCents * f.qty, 0);

  console.log("\nThe host sees everyone, live (no reload)");
  await h.waitForFunction((n) => document.querySelectorAll("[data-testid=group-member]").length === n, FRIENDS, { timeout: 15000 }).catch(() => {});
  check((await h.locator("[data-testid=group-member]").count()) === FRIENDS, `all ${FRIENDS} friends appear on the host's cart within seconds`, await h.locator("[data-testid=group-member]").count());
  const totalTxt = await h.getByTestId("group-total").innerText();
  check(Math.round(Number(totalTxt.replace(/[^\d.]/g, "")) * 100) === expectTotal, `everyone's items: ${(expectTotal / 100).toFixed(2)}`, totalTxt);
  await h.screenshot({ path: `${SHOTS}/group-20-host.png`, fullPage: true });

  console.log("\nCheckout for everyone, while 5 friends still try to change things");
  const late = friends.slice(10, 15).map((f) => call(f, "POST", `/api/group/${code}`, { action: "lines", lines: [line(f.dish, f.qty + 5)] }).then((r) => r.status()));
  await h.getByTestId("group-checkout").click();
  const lateStatuses = await Promise.all(late);
  check(lateStatuses.every((s) => s === 200 || s === 409), "last-second changes are either saved before checkout or politely refused (no errors)", lateStatuses);
  friends.slice(10, 15).forEach((f, k) => { if (lateStatuses[k] === 200) f.qty += 5; });
  await h.waitForURL(/\/checkout/, { timeout: 15000 }); await settle(h);
  const cart = await h.evaluate(() => JSON.parse(localStorage.getItem("nn_cart_v1") || "null"));
  const finalTotal = 750 + friends.reduce((n, f) => n + f.dish.priceCents * f.qty, 0);
  check(cart?.lines.length === FRIENDS + 1, `checkout holds all ${FRIENDS + 1} meals`, cart?.lines.length);
  check(friends.every((f) => cart.lines.some((l) => l.note === `For ${f.name}` && l.quantity === f.qty)), "each friend's meal and quantity, marked “For <name>”");
  await h.getByText("How would you like your order?").waitFor();
  await h.getByRole("button", { name: /^Pickup/ }).first().click();
  await h.getByRole("button", { name: "Continue" }).click();
  await h.getByRole("button", { name: "Review order" }).click();
  await Promise.all([h.waitForURL(/\/order\//, { timeout: 30000 }), h.getByRole("button", { name: /Place order/ }).click()]);
  const ref = h.url().match(/\/order\/([^?]+)/)[1];
  const order = await db.order.findUnique({ where: { reference: ref }, include: { items: true } });
  check(order?.items.length === FRIENDS + 1, `ONE order with all ${FRIENDS + 1} meals`, order?.items.length);
  check(order?.subtotalCents === finalTotal, `priced on the server: ${(finalTotal / 100).toFixed(2)}`, order?.subtotalCents);
  check(friends.every((f) => order.items.some((it) => it.specialInstructions === `For ${f.name}`)), "the restaurant sees whose meal is whose");

  console.log("\nEvery friend sees it was placed");
  const after = await Promise.all(friends.map((f) => call(f, "GET", `/api/group/${code}`).then((r) => r.json())));
  check(after.every((s) => s.status === "ORDERED"), `all ${FRIENDS} friends: “Host placed the order for everyone”`, after.map((s) => s.status));
  const lateJoin = await call(friends[0], "POST", `/api/group/${code}`, { action: "join", name: "Late" });
  check(lateJoin.status() === 410, "nobody can join after it was placed", lateJoin.status());

  check(fiveXX.length === 0, "no server error at any point", fiveXX);
  check(!errors.length, "no page errors", errors);
  await Promise.all(friends.map((f) => f.r.dispose()));
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
