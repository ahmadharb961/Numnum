// Group ordering: the host shares a link, two friends (no account) join with their names and add
// their meals from the normal menu, everyone sees who picked what, the host checks out for everyone
// and places ONE order (friends' items marked "For <name>"), and the friends see it was placed.
//   BASE_URL=http://localhost:3000 node e2e/group-order.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
const SHOTS = process.env.SHOTS || "/tmp";
let ip = 60;

(async () => {
  const db = new PrismaClient();
  const bh = await db.restaurant.findFirstOrThrow({ where: { slug: "burger-house" } });
  const host = await db.user.findUniqueOrThrow({ where: { email: "customer@numnum.demo" } });
  await db.user.update({ where: { id: host.id }, data: { locale: "en" } });
  const b = await chromium.launch();
  const errors = [];
  async function phone(email) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.6.${ip++}` }, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.addCookies([{ name: "nn_lang", value: "en", url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email || "guest"}: ${String(e).slice(0, 160)}`));
    await p.addLocatorHandler(p.getByRole("dialog", { name: /How was your order\?/ }), async () => p.getByRole("button", { name: /^Not now$/ }).click({ timeout: 3000 }).catch(() => {}));
    p.on("dialog", (d) => d.accept());
    if (email) {
      await p.goto("/login");
      await p.fill("#email", email);
      await p.fill("#password", "demo1234");
      await p.locator("form button[type=submit]").click();
      await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    } else await p.goto("/", { waitUntil: "load" });
    await p.evaluate(() => { localStorage.removeItem("nn_cart_v1"); localStorage.removeItem("nn_group_v1"); });
    return p;
  }
  async function addDish(p, dish) {
    await p.goto(`/r/${bh.slug}`, { waitUntil: "load" }); await settle(p);
    await p.getByLabel(`Add ${dish}`).first().click();
    await p.getByRole("button", { name: /Add to cart/ }).click();
    await p.waitForTimeout(900); // the change is sent to the group shortly after
  }

  console.log("\nThe host starts a group order from the cart");
  const h = await phone("customer@numnum.demo");
  await addDish(h, "Double Smash Burger");
  await h.goto("/cart", { waitUntil: "load" }); await settle(h);
  await h.getByTestId("start-group").click();
  await h.fill("#group-name", "Ahmad");
  await h.getByTestId("create-group").click();
  await h.getByTestId("share-whatsapp").waitFor({ timeout: 8000 }).catch(async () => { await h.screenshot({ path: `${SHOTS}/group-create-fail.png` }); console.log("toast:", await h.locator("[role=status], [role=alert]").allInnerTexts()); });
  const wa = await h.getByTestId("share-whatsapp").getAttribute("href").catch(() => null);
  const code = (await h.evaluate(() => JSON.parse(localStorage.getItem("nn_group_v1") || "null")))?.code;
  check(!!code && decodeURIComponent(wa || "").includes(`/g/${code}`), "a WhatsApp invite with the group link opens", wa);
  await h.keyboard.press("Escape");
  await h.goto("/cart", { waitUntil: "load" }); await settle(h);
  check(await h.getByTestId("group-panel").isVisible(), "the cart shows the group order");

  console.log("\nTwo friends join from the link (no account)");
  const f1 = await phone(null);
  await f1.goto(`/g/${code}`, { waitUntil: "load" }); await settle(f1);
  check((await f1.getByTestId("group-title").innerText()).includes("Ahmad's group order"), "the link says whose order it is: Ahmad's group order");
  const og = await f1.evaluate(() => document.querySelector('meta[property="og:title"]')?.getAttribute("content"));
  check(/Join Ahmad's order from Burger House/.test(og || ""), "and so does the WhatsApp preview", og);
  await f1.fill("#join-name", "Rana");
  await f1.getByTestId("group-join").click();
  await f1.waitForURL(new RegExp(`/r/${bh.slug}`), { timeout: 10000 });
  check(true, "joining opens the restaurant's menu");
  await addDish(f1, "Crispy Chicken Burger");

  const f2 = await phone(null);
  await f2.goto(`/g/${code}`, { waitUntil: "load" }); await settle(f2);
  await f2.fill("#join-name", "Karim");
  await f2.getByTestId("group-join").click();
  await f2.waitForURL(new RegExp(`/r/${bh.slug}`), { timeout: 10000 });
  await addDish(f2, "Loaded Fries");

  console.log("\nEveryone sees who picked what");
  await h.goto("/cart", { waitUntil: "load" }); await settle(h);
  await h.waitForFunction(() => document.querySelectorAll("[data-testid=group-member]").length === 2, null, { timeout: 10000 }).catch(() => {});
  const members = await h.locator("[data-testid=group-member]").allInnerTexts();
  check(members.some((m) => /Rana/.test(m) && /Crispy Chicken Burger/.test(m)) && members.some((m) => /Karim/.test(m) && /Loaded Fries/.test(m)), "the host sees Rana: Crispy Chicken Burger, Karim: Loaded Fries", members);
  const totalTxt = await h.getByTestId("group-total").innerText();
  check(totalTxt.includes("19.25"), "everyone's items: $7.50 + $6.75 + $5.00 = $19.25", totalTxt);
  await h.screenshot({ path: `${SHOTS}/group-host-cart.png`, fullPage: true });
  await f1.goto("/cart", { waitUntil: "load" }); await settle(f1);
  await f1.waitForFunction(() => document.querySelectorAll("[data-testid=group-member]").length === 2, null, { timeout: 10000 }).catch(() => {});
  const seen = await f1.locator("[data-testid=group-member]").allInnerTexts();
  check(seen.some((m) => /Ahmad/.test(m) && /Double Smash Burger/.test(m)) && seen.some((m) => /Karim/.test(m)), "a friend sees the others too (and has no checkout button)", seen);
  check((await f1.getByRole("button", { name: /Continue to checkout|Checkout for everyone/ }).count()) === 0, "friends don't check out: the host does");
  await f1.screenshot({ path: `${SHOTS}/group-friend-cart.png`, fullPage: true });

  console.log("\nThe host checks out for everyone");
  await h.getByTestId("group-checkout").click();
  await h.waitForURL(/\/checkout/, { timeout: 10000 }); await settle(h);
  const cart = await h.evaluate(() => JSON.parse(localStorage.getItem("nn_cart_v1") || "null"));
  check(cart?.lines.length === 3 && cart.lines.some((l) => l.note === "For Rana") && cart.lines.some((l) => l.note === "For Karim"), "the checkout has all 3 meals, friends' marked “For Rana” / “For Karim”", cart?.lines.map((l) => [l.name, l.note]));
  // Friends can't change items while the host checks out.
  const locked = await f2.evaluate(async (c) => (await fetch(`/api/group/${c}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lines", lines: [] }) })).status, code);
  check(locked === 409, "a friend's change during checkout is refused (the host's order stays as shown)", locked);
  await h.getByText("How would you like your order?").waitFor();
  await h.getByRole("button", { name: /^Pickup/ }).first().click();
  await h.getByRole("button", { name: "Continue" }).click();
  await h.getByRole("button", { name: "Review order" }).click();
  await Promise.all([h.waitForURL(/\/order\//, { timeout: 20000 }), h.getByRole("button", { name: /Place order/ }).click()]);
  const ref = h.url().match(/\/order\/([^?]+)/)[1];
  const order = await db.order.findUnique({ where: { reference: ref }, include: { items: true } });
  check(order?.items.length === 3 && order.subtotalCents === 1925, "ONE order with the 3 meals, $19.25 (priced again on the server)", [order?.items.length, order?.subtotalCents]);
  check(order?.items.some((i) => i.specialInstructions === "For Rana") && order.items.some((i) => i.specialInstructions === "For Karim"), "the restaurant sees whose meal is whose", order?.items.map((i) => i.specialInstructions));
  check((await db.groupCart.findUnique({ where: { code } }))?.status === "ORDERED", "the group is closed as ordered");
  check(!(await h.evaluate(() => localStorage.getItem("nn_group_v1"))), "the host's phone leaves the group");

  console.log("\nThe friends see it was placed");
  await f1.goto("/cart", { waitUntil: "load" }); await settle(f1);
  check(await f1.getByTestId("group-ordered").waitFor({ timeout: 10000 }).then(() => true, () => false), "Rana's cart: “Ahmad placed the order for everyone 🎉”");
  await f1.getByTestId("group-ordered").getByRole("button", { name: "Done" }).click();
  check(!(await f1.evaluate(() => localStorage.getItem("nn_group_v1"))) && !(await f1.evaluate(() => localStorage.getItem("nn_cart_v1"))), "Done: back to a normal, empty cart");
  await f2.goto(`/g/${code}`, { waitUntil: "load" }); await settle(f2);
  check(await f2.getByTestId("group-closed").isVisible(), "the link now says the order was placed (nobody can join late)");

  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
