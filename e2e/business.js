const { chromium, devices } = require("playwright");
const D = __dirname, SHOTS = process.env.SHOTS || require("os").tmpdir();
async function login(ctx, email, pw) {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Log in" }).click()]);
  return page;
}
async function sweep(page, paths, errors) {
  for (const p of paths) {
    const res = await page.goto(p);
    await page.waitForTimeout(300);
    const bad = await page.locator("text=Something went wrong").count();
    if (res.status() >= 400 || bad) errors.push(`${p} -> ${res.status()}${bad ? " (error boundary)" : ""}`);
  }
}
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const rctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: "http://localhost:3000" });
  const page = await login(rctx, "owner@burgerhouse.demo", "demo1234");
  page.on("pageerror", (e) => errors.push("pageerror " + e.message));
  console.log("owner landed:", new URL(page.url()).pathname);

  if (!process.env.SKIP) {
  await page.goto("/dashboard/orders");
  await page.screenshot({ path: SHOTS + "/10-orders.png" });
  const ref = (await page.locator("button span.font-mono").first().textContent()).trim();
  await page.fill("input[placeholder='NN-2026-000125']", ref);
  await page.locator("form").getByRole("button", { name: /Acknowledge/ }).click();
  await page.waitForURL(/tab=active/);
  console.log("acknowledged", ref, "visible in active:", await page.locator(`text=${ref}`).count());

  await page.goto("/dashboard/menu/import");
  await page.setInputFiles("input[type=file]", (process.env.FIXTURES || D + "/fixtures") + "/menu150.csv");
  await page.waitForSelector("text=Match your columns", { timeout: 20000 });
  await page.getByRole("button", { name: /Validate/ }).click();
  await page.waitForSelector("text=With errors", { timeout: 20000 });
  await page.screenshot({ path: SHOTS + "/11-csv-review.png", fullPage: true });
  console.log("csv stats:", (await page.locator(".card .tabular").allTextContents()).slice(0, 4));
  await page.getByRole("button", { name: /Import \d+ items/ }).click();
  await page.waitForSelector("text=Menu imported", { timeout: 60000 });
  console.log("import result:", await page.locator("text=/created ·/").first().textContent());

  await page.goto("/dashboard/menu/photos");
  await page.setInputFiles("input[type=file][multiple]", (process.env.FIXTURES || D + "/fixtures") + "/photos150.zip");
  await page.waitForSelector("text=Items still missing photos", { timeout: 60000 });
  console.log("match counts [matched, unmatched, dup, unsupported, missing]:", await page.locator(".card .tabular").allTextContents());
  await page.screenshot({ path: SHOTS + "/12-photo-match.png" });
  await page.getByRole("button", { name: /Upload \d+ photos/ }).click();
  await page.waitForSelector("text=Review & assign photos", { timeout: 240000 });
  console.log("upload failures:", await page.locator("td .text-red-600").count());
  }

  await sweep(page, ["/dashboard", "/dashboard/menu", "/dashboard/customizations", "/dashboard/reels", "/dashboard/reels/new", "/dashboard/reviews", "/dashboard/billing", "/dashboard/settings", "/dashboard/staff", "/dashboard/verification", "/dashboard/agreement", "/dashboard/publish", "/dashboard/notifications", "/dashboard/menu/items/new"], errors);
  await page.goto("/dashboard/billing");
  await page.screenshot({ path: SHOTS + "/13-billing.png", fullPage: true });
  const invId = (await page.locator("a[href^='/dashboard/billing/']").first().getAttribute("href")).split("/").pop();
  await page.goto("/dashboard");
  await page.screenshot({ path: SHOTS + "/14-overview.png", fullPage: true });
  console.log("dashboard overflow:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));

  const octx = await browser.newContext({ baseURL: "http://localhost:3000" });
  const other = await login(octx, "owner@manousheh.demo", "demo1234");
  const r1 = await other.request.get(`/api/invoices/${invId}/pdf`);
  const r2 = await other.goto(`/dashboard/billing/${invId}`);
  console.log("other sees invoice content:", (await other.content()).includes("Itemized statement"), "not-found shown:", (await other.content()).includes("This plate is empty"));
  const receipts = await other.request.get(`/dashboard/orders?ref=NN`);
  console.log("isolation: other restaurant invoice pdf", r1.status(), "invoice page", r2.status(), "orders page sees burger refs:", (await receipts.text()).includes("John Smith"));

  const actx = await browser.newContext({ viewport: { width: 1366, height: 900 }, baseURL: "http://localhost:3000" });
  const admin = await login(actx, "admin@numnum.app", "admin1234");
  console.log("admin landed:", new URL(admin.url()).pathname);
  if (!process.env.SKIP) {
  await admin.goto("/admin/payments");
  await admin.getByRole("button", { name: /^Approve/ }).isDisabled().then((d) => console.log("approve disabled before confirming funds:", d));
  await admin.check("text=I confirmed the funds were received in the Whish account");
  await admin.getByRole("button", { name: /^Approve/ }).click();
  await admin.waitForTimeout(2000);
  }
  await admin.goto(`/admin/invoices/${invId}`);
  console.log("invoice status after approval:", await admin.locator("section span.rounded-full").first().textContent());
  await admin.screenshot({ path: SHOTS + "/15-admin-invoice.png", fullPage: true });
  await sweep(admin, ["/admin", "/admin/restaurants", "/admin/verifications", "/admin/orders", "/admin/commissions", "/admin/invoices", "/admin/payments?f=all", "/admin/disputes", "/admin/moderation", "/admin/moderation?tab=reels", "/admin/moderation?tab=reviews", "/admin/moderation?tab=images", "/admin/categories", "/admin/settings", "/admin/audit", "/admin/notifications"], errors);
  await admin.goto("/admin/restaurants");
  const rid = await admin.locator("a[href^='/admin/restaurants/']").first().getAttribute("href");
  await sweep(admin, [rid], errors);
  await admin.goto("/admin");
  await admin.screenshot({ path: SHOTS + "/16-admin.png", fullPage: true });
  const pdf = await admin.request.get(`/api/invoices/${invId}/pdf`);
  console.log("admin pdf:", pdf.status(), pdf.headers()["content-type"], (await pdf.body()).length, "bytes");
  const csv = await admin.request.get(`/api/admin/export?type=commissions`);
  console.log("export:", csv.status(), (await csv.text()).split("\n")[0]);

  const anon = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
  await anon.goto("/admin");
  console.log("anon /admin ->", new URL(anon.url()).pathname);
  await anon.goto("/dashboard");
  console.log("anon /dashboard ->", new URL(anon.url()).pathname);
  console.log("ERRORS:", errors);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
