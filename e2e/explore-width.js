// Explore never scrolls sideways on a phone: every tab, English and Arabic, with a long creator bio.
//   BASE_URL=http://localhost:3000 node e2e/explore-width.js
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});
(async () => {
  const b = await chromium.launch();
  for (const device of ["iPhone SE", "iPhone 13"]) for (const lang of ["en", "ar"]) {
    const ctx = await b.newContext({ ...devices[device], baseURL: BASE });
    await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
    const p = await ctx.newPage();
    for (const tab of ["dishes", "reels", "restaurants", "creators"]) {
      await p.goto(`/explore?type=${tab}`, { waitUntil: "networkidle" }); await settle(p); await p.waitForTimeout(300);
      const w = { doc: await p.evaluate(() => document.documentElement.scrollWidth), view: p.viewportSize().width };
      check(w.doc <= w.view, `${device} ${lang} ${tab}: no sideways scroll`, w);
      if (tab === "creators") {
        const n = await p.locator('[data-testid="creator-result"]:visible').count();
        check(n >= 1, `${device} ${lang}: Mr. Foodies is listed`, n);
        const box = await p.locator('[data-testid="creator-result"]:visible').first().boundingBox();
        check(box && box.x >= 0 && box.x + box.width <= w.view, `${device} ${lang}: creator card fits the screen`, box);
        await p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/explore-creators-${device.replace(/ /g, "")}-${lang}.png` });
      }
    }
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
