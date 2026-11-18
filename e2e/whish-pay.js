// The restaurant sees how to pay numnum: Whish to 76 066 652, restaurant name in the transfer note.
//   BASE_URL=http://localhost:3000 node e2e/whish-pay.js
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
let ip = 40;

(async () => {
  const db = new PrismaClient();
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@burgerhouse.demo" }, include: { staff: { include: { restaurant: true } } } });
  const r = owner.staff[0].restaurant;
  // An unpaid invoice, so the pay sheet can be opened.
  const inv = await db.invoice.findFirst({ where: { restaurantId: r.id, status: { in: ["ISSUED", "OVERDUE", "PARTIALLY_PAID"] } } });
  const b = await chromium.launch();
  const errors = [];
  for (const lang of ["en", "ar"]) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.4.7.${ip++}` } });
    await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
    await db.user.update({ where: { id: owner.id }, data: { locale: lang } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await p.goto("/login");
    await p.fill("#email", owner.email);
    await p.fill("#password", "demo1234");
    await p.locator("form button[type=submit]").click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    console.log(`\n${lang}: Billing & Commissions`);
    await p.goto("/dashboard/billing", { waitUntil: "load" }); await settle(p);
    const box = p.getByTestId("how-to-pay");
    const text = await box.innerText().catch(() => "");
    check(lang === "en" ? /How you pay numnum/.test(text) && /8% commission/.test(text) && /1st of each month/.test(text) : /كيف تدفع/.test(text) && /8%/.test(text), "always shows how to pay, the 8% and the 1st of each month", text.slice(0, 200));
    check((await p.getByTestId("how-whish-number").innerText()).includes("76 066 652"), "Whish number 76 066 652");
    check((await p.getByTestId("how-whish-note").innerText()).includes(r.displayName), `transfer note: the restaurant name (${r.displayName})`);
    await p.getByTestId("how-to-pay").screenshot({ path: `${process.env.SHOTS || "/tmp"}/how-to-pay-${lang}.png` });
    if (inv && lang === "en") {
      await p.goto(`/dashboard/billing/${inv.id}`, { waitUntil: "load" }); await settle(p);
      await p.getByRole("button", { name: /Pay via Whish/ }).click();
      const note = await p.getByTestId("whish-note").innerText({ timeout: 8000 }).catch(() => "");
      check(note.includes(`${r.displayName} · ${inv.number}`), "pay sheet: note = restaurant name · invoice number", note);
      check((await p.getByTestId("whish-number").innerText()).includes("76 066 652"), "pay sheet: Whish number");
      const pdf = await p.evaluate(async (id) => (await fetch(`/api/invoices/${id}/pdf`)).status, inv.id).catch(() => 0);
      console.log(`  (invoice PDF status ${pdf})`);
    } else if (!inv && lang === "en") console.log("  (no unpaid invoice in the demo data: pay sheet not checked)");
    await ctx.close();
  }
  await db.user.update({ where: { id: owner.id }, data: { locale: "en" } });
  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
