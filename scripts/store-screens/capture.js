// Captures real numnum screens for the store screenshots, from a server on :3005 running a clean demo
// database (SEED_DEMO=true).   node scripts/store-screens/capture.js <output dir>
const { chromium, devices } = require("playwright");
const OUT = process.argv[2];
const BASE = "http://localhost:3005";
const { PrismaClient } = require("@prisma/client");
// The first shot is the Pesto Caprese reel (a full-screen vertical video).
// The customer is in Jounieh, about 1 km from Pizza Forno, the restaurant the whole set follows.
const HAMRA = { latitude: 33.9712, longitude: 35.6121 };
(async () => {
  const b = await chromium.launch();
  const phone = { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, baseURL: BASE, geolocation: HAMRA, permissions: ["geolocation"] };
  const loc = [{ name: "nn_loc", value: encodeURIComponent(JSON.stringify({ lat: HAMRA.latitude, lng: HAMRA.longitude, label: "Jounieh" })), url: BASE }];
  const shot = async (p, name) => { await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("saved", name); };
  const guest = await b.newContext(phone);
  await guest.addCookies(loc);
  let p = await guest.newPage();
  const db = new PrismaClient();
  const reel = await db.reel.findFirstOrThrow({ where: { restaurant: { slug: "pizza-forno" }, status: "READY", visibility: "PUBLISHED", menuItem: { name: "Pesto Caprese" } } }).catch(() => db.reel.findFirstOrThrow({ where: { restaurant: { slug: "pizza-forno" }, status: "READY" }, orderBy: { viewCount: "desc" } }));
  await db.$disconnect();
  await p.goto(`/reel/${reel.id}`, { waitUntil: "networkidle" }); await shot(p, "1-reels");
  await p.goto("/explore", { waitUntil: "networkidle" });
  await shot(p, "2-explore");
  // Pizza Forno is in Jounieh: look at it from nearby, as a customer there would.
  await p.goto("/r/pizza-forno", { waitUntil: "networkidle" });
  await p.getByRole("tab", { name: /Reels/ }).first().click().catch(async () => p.getByText("Reels", { exact: true }).first().click().catch(() => {}));
  await p.evaluate(() => { document.querySelector(".app-scroll")?.scrollTo(0, 0); window.scrollTo(0, 0); });
  await shot(p, "3-profile");
  await p.goto("/r/pizza-forno", { waitUntil: "networkidle" });
  await p.getByLabel("Add Margherita").first().click(); await p.getByRole("button", { name: /Add to cart/ }).waitFor();
  await shot(p, "4-dish");
  // checkout choice (logged-in customer)
  const cust = await b.newContext(phone);
  await cust.addCookies(loc);
  p = await cust.newPage();
  await p.goto("/login"); await p.fill("#email", "customer@numnum.demo"); await p.fill("#password", "demo1234");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Log in" }).click()]);
  await p.goto("/r/pizza-forno", { waitUntil: "networkidle" });
  const d = p.getByRole("dialog", { name: "How was your order?" });
  if (await d.waitFor({ timeout: 2500 }).then(() => true, () => false)) await d.getByRole("button", { name: /Close|Not now/ }).first().click().catch(() => {});
  await p.getByLabel("Add Margherita").first().click(); await p.getByRole("button", { name: /Add to cart/ }).click(); await p.waitForTimeout(600);
  await p.getByLabel("Add Tiramisu").first().click(); await p.getByRole("button", { name: /Add to cart/ }).click(); await p.waitForTimeout(600);
  await p.goto("/checkout", { waitUntil: "networkidle" }); await p.getByText("How would you like your order?").waitFor();
  await p.getByRole("button", { name: /^Delivery/ }).first().click();
  await shot(p, "5-checkout");
  // restaurant insights
  const own = await b.newContext(phone);
  p = await own.newPage();
  await p.goto("/login"); await p.fill("#email", "owner@forno.demo"); await p.fill("#password", "demo1234");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Log in" }).click()]);
  await p.goto("/dashboard/insights", { waitUntil: "networkidle" }); await shot(p, "6-insights");
  await p.goto("/dashboard/orders", { waitUntil: "networkidle" }); await shot(p, "7-orders");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
