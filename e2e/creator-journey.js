// The creator journey around followers and notifications, as two real people:
// a customer follows Mr. Foodies → he's notified (bell count, Notifications) → his followers list →
// the customer finds him in Account → Following and can unfollow. English and Arabic.
//   BASE_URL=http://localhost:3000 node e2e/creator-journey.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
let ip = 70;

(async () => {
  const db = new PrismaClient();
  const b = await chromium.launch();
  const errors = [];
  async function as(email, lang) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.2.${ip++}` } });
    if (lang) await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email}: ${String(e).slice(0, 160)}`));
    await p.addLocatorHandler(p.getByRole("dialog", { name: /How was your order\?|كيف كان طلبك/ }), async () => p.getByRole("button", { name: /^(Not now|ليس الآن)$/ }).click({ timeout: 3000 }).catch(() => {}));
    await p.goto("/login");
    await p.fill("#email", email);
    await p.fill("#password", "demo1234");
    await p.locator("form button[type=submit]").click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    return p;
  }
  const foodies = await db.creator.findFirstOrThrow({ where: { handle: "mr.foodies" }, select: { id: true, userId: true, followerCount: true } });
  const fan = await db.user.findUniqueOrThrow({ where: { email: "customer@numnum.demo" }, select: { id: true, name: true } });
  await db.creatorFollow.deleteMany({ where: { creatorId: foodies.id, userId: fan.id } });
  // Start clean: the true follower count, and English (an earlier run may have switched him to Arabic).
  await db.creator.update({ where: { id: foodies.id }, data: { followerCount: await db.creatorFollow.count({ where: { creatorId: foodies.id } }) } });
  await db.user.updateMany({ where: { id: { in: [foodies.userId, fan.id] } }, data: { locale: "en" } });
  await db.notification.deleteMany({ where: { userId: foodies.userId, type: "creator_new_follower" } });
  await db.notification.updateMany({ where: { userId: foodies.userId }, data: { readAt: new Date() } });
  const shortName = (() => { const [f, ...r] = fan.name.trim().split(/\s+/); return r.length ? `${f} ${r[r.length - 1][0].toUpperCase()}.` : f; })();

  console.log("\nThe customer follows Mr. Foodies");
  const c = await as("customer@numnum.demo", "en");
  await c.goto("/c/mr.foodies", { waitUntil: "load" }); await settle(c);
  await c.getByTestId("follow-creator").click();
  await c.getByTestId("follow-creator").filter({ hasText: "Following" }).waitFor();
  check(true, "taps Follow → Following");

  console.log("\nMr. Foodies is told at once");
  const m = await as("mrfoodies@numnum.demo", "en");
  await m.goto("/creator", { waitUntil: "load" }); await settle(m);
  const badge = m.locator("[data-testid=notifications-bell]:visible [data-testid=notifications-unread]").first();
  check((await badge.innerText().catch(() => "")) === "1", "the studio's bell shows 1 new", await badge.innerText().catch(() => null));
  await m.goto("/account", { waitUntil: "load" }); await settle(m);
  check((await m.locator("[data-testid=account-hero] [data-testid=notifications-unread]").innerText().catch(() => "")) === "1", "and so does the bell on Account");
  await m.locator("[data-testid=account-hero] [data-testid=notifications-bell]").click();
  await m.waitForURL(/\/account\/notifications/); await settle(m);
  const note = m.locator("[data-testid=notification]:visible").first();
  const text = (await note.innerText()).replace(/[\u2068\u2069]/g, "");
  check(text.includes(`${shortName} started following you`) && text.includes("just now"), `Notifications: "${shortName} started following you · just now"`, text);
  check((await note.locator("[data-unread]").count()) === 1, "shown as new");
  await note.click();
  await m.waitForURL(/\/creator\/followers/); await settle(m);
  const row = m.locator("[data-testid=follower]:visible").filter({ hasText: shortName }).first();
  check(await row.waitFor({ timeout: 10000 }).then(() => true, () => false), "tapping it opens the followers list, with the new follower in it");
  check(/bg-brand-50/.test((await row.getAttribute("class")) || ""), "highlighted");
  // The bell is cleared once the notifications were seen.
  await m.goto("/creator", { waitUntil: "load" }); await settle(m);
  check((await m.locator("[data-testid=notifications-bell]:visible [data-testid=notifications-unread]").count()) === 0, "the bell's count is cleared after opening Notifications");
  // The studio's follower count opens the list too.
  await m.getByTestId("studio-followers").click();
  await m.waitForURL(/\/creator\/followers$/); await settle(m);
  const count = (await db.creator.findUniqueOrThrow({ where: { id: foodies.id }, select: { followerCount: true } })).followerCount;
  check((await m.locator("[data-testid=follower]:visible").count()) === count, `the studio's "followers" opens all of them (${count})`, await m.locator("[data-testid=follower]:visible").count());
  // On his own public profile, his follower count is a link to the list.
  await m.goto("/c/mr.foodies", { waitUntil: "load" }); await settle(m);
  check((await m.locator("a[data-testid=creator-followers]:visible").count()) === 1 && (await m.getByTestId("follow-creator").count()) === 0, "on his own profile the follower count opens the list (no Follow button)");

  console.log("\nThe customer's Following page lists him");
  await c.goto("/account", { waitUntil: "load" }); await settle(c);
  check((await c.locator("a[href='/account/following']:visible").innerText()).includes("1 creator"), "Account → Following counts creators too", await c.locator("a[href='/account/following']:visible").innerText());
  await c.goto("/account/following", { waitUntil: "load" }); await settle(c);
  const fc = c.locator("[data-testid=following-creator]:visible").filter({ hasText: "@mr.foodies" });
  check(await fc.isVisible(), "Mr. Foodies is in Following → Food creators");
  await fc.getByTestId("following-creator-toggle").click();
  await fc.getByTestId("following-creator-toggle").filter({ hasText: "Follow" }).waitFor();
  await c.waitForTimeout(800);
  check(!(await db.creatorFollow.findUnique({ where: { userId_creatorId: { userId: fan.id, creatorId: foodies.id } } })), "unfollow from there works (and the row stays, to undo)");
  await fc.getByTestId("following-creator-toggle").click();
  await c.waitForTimeout(800);
  check(!!(await db.creatorFollow.findUnique({ where: { userId_creatorId: { userId: fan.id, creatorId: foodies.id } } })), "and following again");
  check((await db.notification.count({ where: { userId: foodies.userId, type: "creator_new_follower" } })) === 1, "following again doesn't notify him twice");

  console.log("\nArabic");
  await db.user.update({ where: { id: foodies.userId }, data: { locale: "ar" } }); // his account's language
  const a = await as("mrfoodies@numnum.demo", "ar");
  await a.goto("/account/notifications", { waitUntil: "load" }); await settle(a);
  const ar = (await a.locator("[data-testid=notification]:visible").first().innerText()).replace(/[\u2068\u2069]/g, "");
  check(ar.includes(`بدأ ${shortName} بمتابعتك`), "the notification in Arabic", ar);
  await a.goto("/creator/followers", { waitUntil: "load" }); await settle(a);
  check(await a.locator("h1", { hasText: "المتابِعون" }).first().waitFor({ timeout: 10000 }).then(() => true, () => false), "followers page in Arabic");

  await db.user.update({ where: { id: foodies.userId }, data: { locale: "en" } });
  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
