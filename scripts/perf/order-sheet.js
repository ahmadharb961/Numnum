// Speed check: run against `next start -p 3001`.  node scripts/perf/order-sheet.js off on
// Tap "Order" on the reel on screen → dish photo + "Add to cart" visible, on a slow phone link.
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch();
  for (const mode of process.argv.slice(2)) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: "http://localhost:3001" });
    await ctx.addCookies([{ name: "nn_loc", value: encodeURIComponent(JSON.stringify({ lat: 33.8975, lng: 35.4815, label: "Hamra" })), url: "http://localhost:3001" }]);
    const p = await ctx.newPage();
    if (mode === "off") await p.route("**/api/items/**", async (r) => { if (!globalThis.tapped) return r.abort(); return r.continue(); });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
    await p.goto("/", { waitUntil: "networkidle" });
    await p.waitForTimeout(3000); // watching the reel
    globalThis.tapped = true;
    const t0 = Date.now();
    await p.getByRole("button", { name: /^Order ·/ }).first().click();
    await p.getByRole("button", { name: /Add to cart/ }).waitFor({ timeout: 15000 });
    const sheetMs = Date.now() - t0;
    await p.locator("[role=dialog] img").first().evaluate((img) => img.complete || new Promise((r) => (img.onload = r)));
    console.log(`background loading ${mode.padEnd(3)}: tap Order → dish details ${sheetMs} ms · photo ${Date.now() - t0} ms`);
    await ctx.close();
  }
  await b.close();
})();
