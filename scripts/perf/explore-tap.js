// Speed check (run against a production server on :3001): tap a dish in Explore and a restaurant
// card in Restaurants on a slow phone connection.  node scripts/perf/explore-tap.js
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: "http://localhost:3001" });
  await ctx.addCookies([{ name: "nn_loc", value: encodeURIComponent(JSON.stringify({ lat: 33.8975, lng: 35.4815, label: "Hamra" })), url: "http://localhost:3001" }]);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
  await p.goto("/explore", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  let t0 = Date.now();
  await p.locator('a[href^="/item/"]').first().click();
  await p.getByRole("button", { name: /Add to cart/ }).waitFor({ timeout: 15000 });
  console.log(`Explore: tap dish → details ${Date.now() - t0} ms`);
  await p.keyboard.press("Escape");
  await p.goto("/restaurants", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  t0 = Date.now();
  await p.locator('a[href^="/r/"]').first().click();
  await p.waitForURL(/\/r\//);
  await p.locator("h1").first().waitFor({ timeout: 15000 });
  console.log(`Restaurants: tap card → restaurant page ${Date.now() - t0} ms`);
  await b.close();
})();
