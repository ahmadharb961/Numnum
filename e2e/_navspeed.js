// Tap → new screen visible, on a slow phone connection (300 ms latency, 1.5 Mb/s).
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: "http://localhost:3001" });
  await ctx.addCookies([{ name: "nn_loc", value: encodeURIComponent(JSON.stringify({ lat: 33.8975, lng: 35.4815, label: "Hamra" })), url: "http://localhost:3001" }]);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
  await p.goto("/restaurants", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500); // let background prefetches finish, like a person looking at the screen
  const tabs = [["Explore", "/explore"], ["Restaurants", "/restaurants"], ["Home", "/"], ["Explore", "/explore"], ["Restaurants", "/restaurants"]];
  for (const [name, path] of tabs) {
    const t0 = Date.now();
    await p.locator(`nav a[href="${path}"]`).last().click();
    await p.waitForURL((u) => u.pathname === path, { timeout: 15000 });
    const urlMs = Date.now() - t0;
    // the real content of each screen (not a skeleton)
    const marker = { "/explore": 'input[placeholder*="Search"]', "/account": "h1, h2", "/restaurants": 'a[href^="/r/"]', "/": "video, [data-testid=reel]" }[path];
    await p.locator(marker).first().waitFor({ timeout: 15000 });
    console.log(`${name.padEnd(12)} tap → URL ${String(urlMs).padStart(5)} ms · content ${String(Date.now() - t0).padStart(5)} ms`);
    await p.waitForTimeout(1500);
  }
  await b.close();
})();
