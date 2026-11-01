// Admin flows: verify a restaurant directly (note required, badge, audit, notification, then restored)
// and "Manage as admin" there and back. Run it through a proxy too (like Hostinger) to catch
// redirects that point at the server's internal address.
//   BASE_URL=http://localhost:3000 node e2e/admin-verify.js
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const S = process.env.SHOTS || require("os").tmpdir();
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — " + JSON.stringify(x)}`); if (!c) fails++; };
(async () => {
  const r = await db.restaurant.findUniqueOrThrow({ where: { slug: "pizza-forno" } });
  await db.restaurant.update({ where: { id: r.id }, data: { verificationStatus: "NOT_REQUESTED" } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("/login"); await p.fill("#email", process.env.ADMIN_EMAIL || "admin@numnum.app"); await p.fill("#password", process.env.ADMIN_PASSWORD || "admin1234");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Log in" }).click()]);
  await p.goto(`/admin/restaurants/${r.id}`, { waitUntil: "networkidle" });
  check(await p.getByText("not verified").count() > 0, "header shows 'not verified'");
  await p.screenshot({ path: `${S}/verify-before.png` });
  // empty note is refused
  p.once("dialog", (d) => d.accept(""));
  await p.getByRole("button", { name: "Mark as verified" }).click(); await p.waitForTimeout(1200);
  check((await db.restaurant.findUnique({ where: { id: r.id } })).verificationStatus === "NOT_REQUESTED", "empty note → not verified");
  p.once("dialog", (d) => d.accept("Commercial registration 12345 checked in person"));
  await p.getByRole("button", { name: "Mark as verified" }).click(); await p.waitForTimeout(1500);
  check((await db.restaurant.findUnique({ where: { id: r.id } })).verificationStatus === "APPROVED", "restaurant now APPROVED");
  check(!!(await db.auditLog.findFirst({ where: { action: "verification.admin_verify", entityId: r.id } })), "audit log entry with the note");
  check(!!(await db.notification.findFirst({ where: { restaurantId: r.id, type: "VERIFICATION_UPDATE" }, orderBy: { createdAt: "desc" } })), "restaurant notified");
  await p.reload({ waitUntil: "networkidle" });
  check(await p.getByRole("button", { name: "Revoke badge" }).count() > 0 && await p.getByText("✓ verified").count() > 0, "page now shows ✓ verified + Revoke badge");
  await p.screenshot({ path: `${S}/verify-after.png` });
  const g = await (await b.newContext({ baseURL: BASE })).newPage();
  await g.goto("/r/pizza-forno", { waitUntil: "networkidle" });
  check(await g.locator("h1 [title], h1 svg").count() > 0, "public profile shows the verified badge");
  await g.screenshot({ path: `${S}/verify-public.png` });
  await p.goto("/admin/restaurants?filter=verified", { waitUntil: "networkidle" });
  check((await p.locator("tbody").innerText()).includes("Pizza Forno"), "listed under the Verified filter");
  // Manage as admin → the restaurant's dashboard with the admin bar → Back to admin
  await p.goto(`/admin/restaurants/${r.id}`, { waitUntil: "networkidle" });
  await Promise.all([p.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {}), p.getByRole("button", { name: /Manage as admin/ }).click()]);
  const u1 = new URL(p.url());
  check(u1.origin === new URL(BASE).origin && u1.pathname.startsWith("/dashboard"), "Manage as admin opens the dashboard on the same site", p.url());
  check(await p.getByText(/Admin: managing/).count() > 0 && (await p.locator("body").innerText()).includes("Pizza Forno"), "dashboard shows the admin bar for Pizza Forno");
  await p.screenshot({ path: `${S}/manage-dashboard.png` });
  await p.goto("/dashboard/menu", { waitUntil: "networkidle" });
  check(new URL(p.url()).pathname === "/dashboard/menu" && (await p.locator("body").innerText()).includes("Pizza Forno"), "admin can open the restaurant's menu manager");
  await Promise.all([p.waitForURL(/\/admin\/restaurants\//, { timeout: 15000 }).catch(() => {}), p.getByRole("button", { name: "Back to admin" }).click()]);
  const u2 = new URL(p.url());
  check(u2.origin === new URL(BASE).origin && u2.pathname === `/admin/restaurants/${r.id}`, "Back to admin returns to the restaurant's admin page", p.url());
  await p.goto("/dashboard", { waitUntil: "networkidle" });
  check(!(await p.getByText(/Admin: managing/).count()), "after leaving, the admin is no longer managing the restaurant");

  // put it back as it was
  await db.restaurant.update({ where: { id: r.id }, data: { verificationStatus: r.verificationStatus } });
  await b.close(); await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed"); process.exit(fails ? 1 : 0);
})();
