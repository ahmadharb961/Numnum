const { chromium, devices } = require("playwright");
const SHOTS = (process.env.SHOTS || require("os").tmpdir());
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: "http://localhost:3000" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  let waUrl = null;
  await ctx.route(/wa\.me/, (route) => { waUrl = route.request().url(); route.fulfill({ status: 200, body: "whatsapp" }); });

  await page.goto("/");
  await page.waitForSelector("section[data-index='0']");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SHOTS + "/01-home-reels.png" });
  // find a Burger House reel with smash burger
  const reels = page.locator("section[data-index]");
  const n = await reels.count();
  let target = -1;
  for (let i = 0; i < n; i++) { const t = await reels.nth(i).getAttribute("aria-label"); if (t && t.includes("Double Smash")) { target = i; break; } }
  console.log("reels loaded:", n, "smash index:", target);
  if (target > 0) { await reels.nth(target).scrollIntoViewIfNeeded(); await page.waitForTimeout(1500); }
  await reels.nth(Math.max(0,target)).getByRole("button", { name: /^Order/ }).click();
  await page.waitForSelector("text=Add to cart");
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + "/02-item-sheet.png" });
  // select cheese default is Cheddar, add Extra cheese, BBQ sauce, Add fries
  await page.getByRole("button", { name: /Extra cheese/ }).click();
  await page.getByRole("button", { name: /BBQ sauce/ }).click();
  await page.getByRole("button", { name: /Add fries/ }).click();
  await page.getByRole("button", { name: /No pickles/ }).click();
  await page.getByLabel("Increase quantity").click();
  await page.screenshot({ path: SHOTS + "/03-customized.png", fullPage: false });
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.waitForTimeout(800);
  await page.goto("/cart");
  await page.waitForSelector("text=Continue to checkout");
  await page.screenshot({ path: SHOTS + "/04-cart.png" });
  await page.getByRole("button", { name: /Continue to checkout/ }).click();
  await page.waitForSelector("text=How would you like your order?");
  await page.getByRole("button", { name: /Delivery/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill("#name", "John Smith");
  await page.fill("#phone", "70 123 456");
  await page.selectOption("#area", "Hamra");
  await page.fill("#address", "Bliss street, near AUB main gate");
  await page.fill("#building", "Azar bldg, 3rd floor");
  await page.getByPlaceholder("or paste a Google Maps link").fill("https://maps.google.com/?q=33.8995,35.4807");
  await page.screenshot({ path: SHOTS + "/05-details.png", fullPage: true });
  await page.getByRole("button", { name: "Review order" }).click();
  await page.waitForSelector("text=Confirm your order");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS + "/06-confirm.png", fullPage: true });
  await page.getByRole("button", { name: /Send order via WhatsApp/ }).click();
  await page.waitForTimeout(3000);
  console.log("WA URL:", waUrl ? waUrl.slice(0, 60) + "..." : null);
  if (waUrl) console.log(decodeURIComponent(new URL(waUrl).searchParams.get("text")));
  // horizontal overflow check on key pages
  for (const p of ["/", "/explore", "/restaurants", "/r/burger-house", "/saved", "/cart"]) {
    await page.goto(p); await page.waitForTimeout(800);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log("overflow", p, ov);
  }
  await page.goto("/r/burger-house"); await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS + "/07-profile.png" });
  await page.getByRole("tab", { name: /Reels/ }).click(); await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + "/08-profile-reels.png" });
  await page.goto("/explore?q=burger"); await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS + "/09-explore.png" });
  console.log("ERRORS:", errors.slice(0, 10));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
