// End-to-end run against a local app + local Supabase (see README → "Testing").
//   BASE_URL=http://localhost:3000 DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node e2e/full-flow.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import sharp from "sharp";

// Playwright is not a project dependency; use the one installed on the machine.
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const OUT = process.env.SHOTS ?? "e2e/screenshots";
mkdirSync(OUT, { recursive: true });

const sql = (q) => execFileSync("psql", [DB, "-tAc", q], { encoding: "utf8" }).trim();
const run = Date.now().toString(36);
let step = 0;
const ok = (msg) => console.log(`ok ${++step} - ${msg}`);
const assert = (cond, msg) => {
  if (!cond) throw new Error("FAIL: " + msg);
  ok(msg);
};

// A photo to upload
const photo = `${OUT}/../test-photo.jpg`;
await sharp({ create: { width: 1400, height: 900, channels: 3, background: "#c99a6b" } })
  .composite([{ input: Buffer.from('<svg width="1400" height="900"><rect x="350" y="250" width="700" height="420" rx="30" fill="#a87443"/><text x="700" y="490" font-size="90" text-anchor="middle" fill="#fff" font-family="Arial">BOX</text></svg>') }])
  .jpeg().toFile(photo);

const browser = await chromium.launch();
process.on("unhandledRejection", async (e) => {
  console.error(e);
  for (const ctx of browser.contexts())
    for (const [i, pg] of ctx.pages().entries()) await pg.screenshot({ path: `${OUT}/FAIL-${i}.png`, fullPage: true }).catch(() => {});
  await browser.close();
  process.exit(1);
});
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const phone = await browser.newContext({ ...devices["iPhone 14"] });

// ---------------------------------------------------------------- visitor
const home = await desktop.newPage();
await home.goto(BASE);
await home.waitForSelector("#live-heading");
const demoCount = await home.locator("ul >> li").count();
assert(demoCount >= 8, `visitor sees the live feed (${demoCount} tasks)`);
await home.screenshot({ path: `${OUT}/01-home-desktop.png` });

const mHome = await phone.newPage();
await mHome.goto(BASE);
await mHome.waitForSelector("#live-heading");
await mHome.screenshot({ path: `${OUT}/02-home-mobile.png` });

await mHome.locator("ul >> li a").first().click();
await mHome.waitForSelector("text=Contact on WhatsApp");
await mHome.screenshot({ path: `${OUT}/03-task-mobile.png`, fullPage: true });
ok("task details page opens");

// ---------------------------------------------------------------- poster signs up
const posterPage = await phone.newPage();
await posterPage.goto(`${BASE}/post`);
await posterPage.waitForURL(/\/login/);
ok("posting requires an account");
await posterPage.click("text=Create account");
await posterPage.fill("#display_name", "Rana");
await posterPage.fill("#email", `rana-${run}@example.com`);
await posterPage.fill("#password", "correct-horse-1");
await posterPage.click("button:has-text('Create account')");
await posterPage.waitForURL(/\/post$/);
ok("sign-up lands on the post form");
await posterPage.screenshot({ path: `${OUT}/04-post-form-mobile.png`, fullPage: true });

async function postTask(page, t) {
  await page.goto(`${BASE}/post`);
  await page.fill("#headline", t.headline);
  await page.fill("#description", t.description);
  await page.fill("#reward", t.reward);
  await page.fill("#location", t.location);
  await page.fill("#whatsapp", "+961 70 123 456");
  await page.click(`label:has-text("${t.deadline}")`);
  if (t.image) await page.setInputFiles("#image", t.image);
  await page.locator("form button[type=submit]").click();
}

// Realtime: the desktop feed should receive the new task without a reload.
const before = await home.locator("ul >> li").count();
await postTask(posterPage, { headline: `Assemble a bookshelf ${run}`, description: "Billy bookcase, parts and screws ready.", reward: "35", location: "Achrafieh", deadline: "3 hours", image: photo });
await posterPage.waitForURL(/\/t\/[0-9a-f-]+\?posted=1/);
await posterPage.waitForSelector("text=Your task is live!");
const taskUrl = posterPage.url().split("?")[0];
const taskId = taskUrl.split("/").pop();
assert(/^[0-9a-f-]{36}$/.test(taskId), "free task 1 published instantly");
await posterPage.screenshot({ path: `${OUT}/05-posted-mobile.png`, fullPage: true });

await home.waitForSelector(`text=Assemble a bookshelf ${run}`, { timeout: 15000 });
assert((await home.locator("ul >> li").count()) === before + 1, "new task appeared in another visitor's feed in real time");
await home.screenshot({ path: `${OUT}/06-home-realtime.png` });

// WhatsApp redirect
const waMobile = await fetch(`${BASE}/t/${taskId}/contact`, { redirect: "manual", headers: { "user-agent": devices["iPhone 14"].userAgent } });
const loc = waMobile.headers.get("location") ?? "";
assert(loc.startsWith("https://wa.me/96170123456?text="), "phone contact goes to wa.me");
assert(decodeURIComponent(loc).includes(`Hi, I saw your task on Yalla Ok: Assemble a bookshelf ${run}. I’m interested in doing it.`), "prefilled WhatsApp message");
const waDesk = await fetch(`${BASE}/t/${taskId}/contact`, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
assert((waDesk.headers.get("location") ?? "").startsWith("https://web.whatsapp.com/send?phone=96170123456"), "desktop contact goes to WhatsApp Web");
const html = await (await fetch(taskUrl)).text();
assert(!html.includes("70123456") && !html.includes("example.com"), "task page never contains the WhatsApp number or email");

// Two more free posts, then the 4th needs payment.
await postTask(posterPage, { headline: `Walk my dog ${run}`, description: "30–45 min around the Corniche.", reward: "20", location: "Ras Beirut", deadline: "1 hour" });
await posterPage.waitForURL(/posted=1/);
await postTask(posterPage, { headline: `Buy groceries ${run}`, description: "A few items, list on WhatsApp.", reward: "15", location: "Verdun", deadline: "30 min" });
await posterPage.waitForURL(/posted=1/);
ok("free tasks 2 and 3 published");

await posterPage.goto(`${BASE}/post`);
await posterPage.waitForSelector("text=Publishing costs $1");
ok("4th task shows the $1 fee up front");
await posterPage.screenshot({ path: `${OUT}/07-post-fee-mobile.png`, fullPage: true });
await postTask(posterPage, { headline: `Fix my laptop ${run}`, description: "It won’t turn on. Quick diagnosis today.", reward: "100", location: "Gemmayze", deadline: "3 hours" });
await posterPage.waitForURL(/\/pay\//);
const paidTaskId = posterPage.url().split("/").pop();
await posterPage.waitForSelector("text=Pay the listing fee");
await posterPage.screenshot({ path: `${OUT}/08-pay-mobile.png`, fullPage: true });
assert(sql(`select status from tasks where id='${paidTaskId}'`) === "draft", "paid task saved as draft until payment");

await posterPage.fill("#reference", `WH-${run}`);
await posterPage.setInputFiles("#screenshot", photo);
await posterPage.click("button:has-text('submit for review')");
await posterPage.waitForSelector("text=We’re checking your Whish payment");
assert(sql(`select status from tasks where id='${paidTaskId}'`) === "pending_payment", "payment submitted → pending payment");
await posterPage.screenshot({ path: `${OUT}/09-pay-pending-mobile.png`, fullPage: true });

// Duplicate posting is refused, and the form keeps the values.
await postTask(posterPage, { headline: `Walk my dog ${run}`, description: "30–45 min around the Corniche.", reward: "20", location: "Ras Beirut", deadline: "1 hour" });
await posterPage.waitForSelector("text=You already have this task listed");
assert((await posterPage.inputValue("#reward")) === "20", "duplicate listing refused and form keeps its values");

// My Tasks + mark taken (leaves other visitors' feed in real time)
await posterPage.goto(`${BASE}/my`);
await posterPage.screenshot({ path: `${OUT}/10-my-tasks-mobile.png`, fullPage: true });
posterPage.once("dialog", (d) => d.accept());
await posterPage.locator("li", { hasText: `Walk my dog ${run}` }).locator("button:has-text('Mark as taken')").click();
await posterPage.locator("li", { hasText: `Walk my dog ${run}` }).getByText("Taken", { exact: true }).waitFor();
assert(sql(`select status from tasks where headline='Walk my dog ${run}'`) === "taken", "poster marked the task as taken");
await home.waitForSelector(`text=Walk my dog ${run}`, { state: "detached", timeout: 15000 });
ok("taken task left another visitor's feed in real time");

// ---------------------------------------------------------------- admin
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const admin = await adminCtx.newPage();
await admin.goto(`${BASE}/signup`);
await admin.fill("#display_name", "Admin");
await admin.fill("#email", `admin-${run}@example.com`);
await admin.fill("#password", "correct-horse-2");
await admin.click("button:has-text('Create account')");
await admin.waitForURL(/\/post$/);
await admin.goto(`${BASE}/admin`);
assert((await admin.locator("text=Nothing here").count()) === 1 && (await admin.locator("text=Verified revenue").count()) === 0, "admin area is hidden from regular users");
sql(`update profiles set role='admin' where email='admin-${run}@example.com'`);

await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("text=Verified revenue");
await admin.screenshot({ path: `${OUT}/11-admin-overview.png`, fullPage: true });

await admin.goto(`${BASE}/admin/payments`);
const card = admin.locator("li", { hasText: `WH-${run}` });
await card.waitFor();
await admin.screenshot({ path: `${OUT}/12-admin-payments.png`, fullPage: true });
await card.locator("button:has-text('approve')").click();
await card.waitFor({ state: "detached" }); // leaves the Pending list
assert(sql(`select status from tasks where id='${paidTaskId}'`) === "active", "admin approval publishes the paid task");
assert(sql(`select count(*) from admin_audit_logs where action='payment.approve' and target_type='payment_submission'`) !== "0", "approval written to the audit log");
await home.waitForSelector(`text=Fix my laptop ${run}`, { timeout: 15000 });
ok("approved task appeared in the live feed in real time");

// Reports
await home.goto(`${BASE}/t/${taskId}`);
await home.click("button:has-text('Report')");
await home.click("button:has-text('Send report')");
await home.waitForSelector("text=our team will take a look");
ok("visitor can report a task");
await admin.goto(`${BASE}/admin/reports`);
await admin.waitForSelector(`text=Assemble a bookshelf ${run}`);
ok("report reaches the admin");

await admin.goto(`${BASE}/admin/tasks?status=active`);
await admin.screenshot({ path: `${OUT}/13-admin-tasks.png` });
await admin.goto(`${BASE}/admin/settings`);
await admin.fill("#whish_number", "+961 71 555 000");
await admin.click("button:has-text('Save settings')");
await admin.waitForSelector("text=Settings saved");
assert(sql(`select whish_number from platform_settings`) === "+961 71 555 000", "admin updates Whish details");
await admin.screenshot({ path: `${OUT}/14-admin-settings.png` });
await admin.goto(`${BASE}/admin/users`);
await admin.screenshot({ path: `${OUT}/15-admin-users.png` });

// Expiry: past deadline → gone from the feed
sql(`update tasks set expires_at = now() + interval '3 seconds' where headline = 'Buy groceries ${run}'`);
await home.goto(BASE);
await home.waitForSelector(`text=Buy groceries ${run}`, { state: "detached", timeout: 20000 });
ok("task disappears when its countdown ends");

await desktop.newPage().then(async (p) => {
  await p.goto(`${BASE}/t/${taskId}`);
  await p.screenshot({ path: `${OUT}/16-task-desktop.png`, fullPage: true });
});

await browser.close();
console.log(`\nAll ${step} end-to-end checks passed. Screenshots in ${OUT}/`);
