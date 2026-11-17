// Computer: opening the restaurant panel from a reel keeps For you / Following centred over the
// video (in English and Arabic), and they still work with the panel open.
//   BASE_URL=http://localhost:3000 node e2e/desktop-panel.js
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0; const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  for (const lang of ["en", "ar"]) {
    console.log(`\n${lang === "en" ? "English" : "Arabic"}`);
    const ctx = await b.newContext({ viewport: { width: 1920, height: 930 }, baseURL: BASE });
    await ctx.addCookies([{ name: "nn_lang", value: lang, url: BASE }]);
    const p = await ctx.newPage();
    const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto("/", { waitUntil: "load" });
    await p.locator("section[data-active='true']").first().waitFor();
    await p.waitForTimeout(1000);
    // How far the tabs' centre is from the centre of the playing video's column.
    const offset = () => p.evaluate(() => {
      const tabs = document.querySelector("[data-testid=desktop-tabs]").getBoundingClientRect();
      const col = document.querySelector("section[data-active='true'] video, section[data-active='true'] img").closest("div.relative").getBoundingClientRect();
      return Math.round(tabs.left + tabs.width / 2 - (col.left + col.width / 2));
    });
    const closed = await offset();
    check(Math.abs(closed) <= 2, `panel closed: tabs centred over the video (${closed}px off)`, closed);
    await p.locator("section[data-active='true'] a[href^='/r/']").first().click();
    await p.locator("a[href^='/r/']", { hasText: lang === "en" ? "Open restaurant page" : /المطعم/ }).last().waitFor();
    await p.waitForTimeout(500); // the slide-in
    const open = await offset();
    check(Math.abs(open) <= 2, `panel open: tabs still centred over the video (${open}px off)`, open);
    await p.getByTestId("desktop-tabs").getByRole("tab").nth(1).click();
    check((await p.getByTestId("desktop-tabs").getByRole("tab").nth(1).getAttribute("aria-selected")) === "true", "and the tabs still work with the panel open");
    check(!errors.length, "no page errors", errors);
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
