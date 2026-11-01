// Admin verifies a restaurant directly: note required, badge shown, audit + notification, then restored.
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
  // put it back as it was
  await db.restaurant.update({ where: { id: r.id }, data: { verificationStatus: r.verificationStatus } });
  await b.close(); await db.$disconnect();
  console.log(fails ? `${fails} FAILED` : "All checks passed"); process.exit(fails ? 1 : 0);
})();
