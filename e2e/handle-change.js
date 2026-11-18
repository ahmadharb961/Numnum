// A creator changes their username (live check, once every 3 months, old link redirects), and the
// super admin changes it any time.
//   BASE_URL=http://localhost:3000 node e2e/handle-change.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
let ip = 90;

(async () => {
  const db = new PrismaClient();
  const foodies = await db.creator.findFirstOrThrow({ where: { handle: "mr.foodies" } });
  const reset = async () => {
    await db.creatorHandleAlias.deleteMany({ where: { creatorId: foodies.id } });
    await db.creator.update({ where: { id: foodies.id }, data: { handle: "mr.foodies", handleChangedAt: null, searchName: foodies.searchName, searchText: foodies.searchText } });
  };
  await reset();
  // Another creator whose username is taken.
  const otherHandle = (await db.creator.findFirst({ where: { NOT: { id: foodies.id } }, select: { handle: true } }))?.handle;
  const b = await chromium.launch();
  const errors = [];
  async function as(email, password, desktop) {
    const ctx = await b.newContext({ ...(desktop ? { viewport: { width: 1360, height: 900 } } : devices["iPhone 13"]), baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.9.${ip++}` } });
    await ctx.addCookies([{ name: "nn_lang", value: "en", url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email}: ${String(e).slice(0, 160)}`));
    await p.goto("/login");
    await p.fill("#email", email);
    await p.fill("#password", password);
    await p.locator("form button[type=submit]").click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    return p;
  }
  const status = (p) => p.locator("[data-testid=handle-status]:visible").first();
  const statusIs = (p, text) => status(p).filter({ hasText: text }).waitFor({ timeout: 8000 }).then(() => true, () => false);

  try {
    console.log("\nThe creator changes their username");
    const c = await as("mrfoodies@numnum.demo", "demo1234");
    await c.goto("/creator/profile", { waitUntil: "load" }); await settle(c);
    check(await statusIs(c, "Your current username"), "the field shows 'Your current username'");
    check((await c.getByText("You can change it once every 3 months").count()) > 0, "and says it can change once every 3 months");
    if (otherHandle) {
      await c.fill("#handle", otherHandle);
      check(await statusIs(c, "This username is taken"), `another creator's username: 'This username is taken' (@${otherHandle})`);
    }
    await c.fill("#handle", "admin");
    check(await statusIs(c, "Choose another username"), "a reserved word is refused as they type");
    await c.fill("#handle", "mr.foodies.lb");
    check(await statusIs(c, "Available"), "a free one: '✓ Available' and numnum.me/c/mr.foodies.lb");
    await c.getByRole("button", { name: "Save profile" }).click();
    await c.waitForURL((u) => u.pathname === "/creator", { timeout: 15000 });
    check((await db.creator.findUniqueOrThrow({ where: { id: foodies.id } })).handle === "mr.foodies.lb", "saved");
    await c.goto("/c/mr.foodies", { waitUntil: "load" }); await settle(c);
    check(new URL(c.url()).pathname === "/c/mr.foodies.lb", "the old profile link leads to the new one", c.url());
    await c.goto("/creator/profile", { waitUntil: "load" }); await settle(c);
    const locked = await c.getByTestId("handle-locked").innerText().catch(() => "");
    check(locked.includes("@mr.foodies.lb") && /can change your username again on \d{1,2} \w{3} \d{4}/.test(locked), "now locked: 'You can change your username again on <date in 3 months>'", locked);
    check((await c.locator("#handle").count()) === 0, "no username field until then");
    await c.context().close();

    console.log("\nSomeone else can't take the old one");
    const n = await as("customer@numnum.demo", "demo1234");
    const html = await n.evaluate(async () => (await fetch("/c/mr.foodies")).text());
    check(/http-equiv="refresh" content="0;url=\/c\/mr\.foodies\.lb"/.test(html), "the old link's page redirects (also for WhatsApp previews and other bots)");
    await n.goto("/c/mr.foodies", { waitUntil: "load" });
    await n.waitForURL(/\/c\/mr\.foodies\.lb$/, { timeout: 10000 }).catch(() => {});
    check(new URL(n.url()).pathname === "/c/mr.foodies.lb", "for someone else too", n.url());
    await n.context().close();

    console.log("\nThe super admin changes it any time");
    const a = await as(process.env.ADMIN_EMAIL || "admin@numnum.app", process.env.ADMIN_PASSWORD || "admin1234", true);
    await a.goto(`/admin/customers/${foodies.userId}`, { waitUntil: "load" }); await settle(a);
    await a.getByTestId("admin-handle-input").fill("mr.foodies");
    check(await a.getByTestId("admin-handle-status").filter({ hasText: "Available" }).waitFor({ timeout: 8000 }).then(() => true, () => false), "live check for the admin too (their own old one is free for them)");
    await a.getByTestId("admin-handle-save").click();
    check(await a.getByText("Username changed to @mr.foodies").waitFor({ timeout: 10000 }).then(() => true, () => false), "changed back, though the creator changed it minutes ago");
    const after = await db.creator.findUniqueOrThrow({ where: { id: foodies.id } });
    check(after.handle === "mr.foodies", "saved");
    check(!!(await db.auditLog.findFirst({ where: { entityId: foodies.id, action: "creator.handle_admin_change" } })), "in the audit log");
    await a.goto("/c/mr.foodies.lb", { waitUntil: "load" }); await settle(a);
    check(new URL(a.url()).pathname === "/c/mr.foodies", "and the other old link redirects to it", a.url());
    await a.context().close();
  } finally {
    await reset();
  }
  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
