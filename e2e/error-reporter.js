// Page errors on phones reach Admin → Settings → App health (with the differing lines for #418),
// and ordinary browsing reports nothing.
//   BASE_URL=http://localhost:4000 node e2e/error-reporter.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:4000";
const db = new PrismaClient();
let fails = 0;
const check = (ok, msg, extra) => { console.log(`${ok ? "✓" : "✗"} ${msg}${ok ? "" : ` — ${JSON.stringify(extra)}`}`); if (!ok) fails++; };
const count = () => db.analyticsEvent.count({ where: { type: "client_error" } });

(async () => {
  await db.analyticsEvent.deleteMany({ where: { type: "client_error" } });
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE });
  await c.route(/imagedelivery|cloudflarestream|videodelivery|tile\.openstreetmap/, (r) => r.abort());
  const p = await c.newPage();
  for (const u of ["/", "/restaurants", "/explore", "/r/burger-house", "/cart", "/checkout", "/account"]) { await p.goto(u, { waitUntil: "networkidle" }); await p.waitForTimeout(400); }
  await p.waitForTimeout(800);
  check((await count()) === 0, "browsing 7 pages reports no errors", await count());

  // A hydration error on the restaurant page: the phone shows a word the server never sent
  await p.goto("/r/burger-house", { waitUntil: "networkidle" });
  await p.evaluate(() => {
    const h = document.querySelector("h1"); if (h) h.textContent = "Drawn differently";
    window.dispatchEvent(new ErrorEvent("error", { message: "Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]=" }));
  });
  await p.waitForTimeout(1500);
  const h = await db.analyticsEvent.findFirst({ where: { type: "client_error" }, orderBy: { createdAt: "desc" } });
  check(h?.data?.hydration === true && h?.data?.path === "/r/burger-house", "a hydration error is reported with its page", h?.data);
  check(h?.data?.clientOnly?.includes("Drawn differently") && (h?.data?.serverOnly?.length ?? 99) <= 3 && (h?.data?.clientOnly?.length ?? 99) <= 3, "with just the lines that differ (the phone drew 'Drawn differently')", { s: h?.data?.serverOnly, c: h?.data?.clientOnly });
  check(/iPhone/.test(h?.data?.ua ?? ""), "and the phone it happened on", h?.data?.ua);

  // An ordinary crash is reported too; at most 3 per page load
  await p.goto("/explore", { waitUntil: "networkidle" });
  await p.evaluate(() => { for (let i = 0; i < 6; i++) setTimeout(() => { throw new Error("Test crash " + i); }, 10 * i); });
  await p.waitForTimeout(1500);
  const crashes = await db.analyticsEvent.findMany({ where: { type: "client_error" }, select: { data: true } });
  const tests = crashes.filter((x) => /Test crash/.test(x.data.message));
  check(tests.length === 3 && tests.every((x) => x.data.path === "/explore" && x.data.hydration === false), "an ordinary error is reported, at most 3 per page", tests.map((x) => x.data.message));

  // Admin sees them
  const a = await (await b.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } })).newPage();
  await a.goto("/login"); await a.fill("#email", "admin@numnum.app"); await a.fill("#password", "admin1234");
  await Promise.all([a.waitForURL((u) => !u.pathname.startsWith("/login")), a.getByRole("button", { name: "Log in" }).click()]);
  await a.goto("/admin/settings", { waitUntil: "networkidle" });
  const list = await a.getByTestId("app-health-list").innerText().catch(() => "");
  check(/React #418/.test(list) && /\/r\/burger-house/.test(list) && /Drawn differently/.test(list), "Admin → Settings → App health shows the #418 with the page and the differing lines", list.slice(0, 300));
  check(/Test crash/.test(list), "and the ordinary errors", list.slice(0, 300));

  await db.analyticsEvent.deleteMany({ where: { type: "client_error" } });
  await a.goto("/admin/settings", { waitUntil: "networkidle" });
  check(await a.getByTestId("app-health-ok").isVisible(), "with nothing reported it says 'No errors reported'");

  await b.close(); await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed");
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
