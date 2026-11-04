// Store screenshots: real numnum screens (captured from the app) in a phone frame with a headline,
// rendered at the exact sizes Apple and Google ask for.
//   node scripts/store-screens/render.js <raw screens dir> <output dir>
// Raw screens: 1170×2532 PNGs (iPhone 13 at 3×) named 1-reels.png … 7-orders.png.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const sharp = require("sharp");

const [RAW, OUT] = process.argv.slice(2).map((p) => path.resolve(p));
const logo = JSON.parse(fs.readFileSync(path.join(__dirname, "logo.json"), "utf8"));
const ORANGE = "#ff5412";

const icons = {
  play: '<polygon points="7 4 20 12 7 20 7 4" />',
  store: '<path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" />',
  bag: '<path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />',
  bike: '<circle cx="5.5" cy="17.5" r="3" /><circle cx="18.5" cy="17.5" r="3" /><path d="M15 6h2l3 11.5" /><path d="M5.5 17.5 9 9h6l-3.5 8.5" />',
  chart: '<path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M2 20h20" />',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />',
};

// Each store image: theme, icon, headline, subline, which screen, phone tilt.
const PANELS = [
  { id: "01-reels", theme: "dark", brand: true, title: "The Food Reel App", sub: "Watch · Discover · Order", screen: "1-reels.png", tilt: -4, whole: true },
  { id: "02-explore", theme: "light", icon: "play", title: "Discover\n& Explore", sub: "Lebanon's best restaurants,\ndishes and trending reels", screen: "2-explore.png", tilt: 5 },
  { id: "03-profile", theme: "dark", icon: "store", title: "Restaurant\nProfiles", sub: "Reels, menu, reviews\nand hours in one place", screen: "3-profile.png", tilt: -5 },
  { id: "04-order", theme: "light", icon: "bag", title: "Order\nin Seconds", sub: "Choose, customize\nand order your way", screen: "4-dish.png", tilt: 5 },
  { id: "05-delivery", theme: "orange", icon: "bike", title: "Delivery\nor Pickup", sub: "Pay cash on delivery.\nNo card needed.", screen: "5-checkout.png", tilt: -5 },
  { id: "06-insights", theme: "dark", icon: "chart", title: "Grow Your\nRestaurant", sub: "Real insights on orders,\nreels and visits", screen: "6-insights.png", tilt: 5 },
  { id: "07-orders", theme: "light", icon: "bell", title: "Never Miss\nan Order", sub: "Instant alerts. Accept\nand call in one tap", screen: "7-orders.png", tilt: -5 },
];

const THEMES = {
  dark: { bg: `radial-gradient(120% 70% at 85% 100%, rgba(255,84,18,.55), rgba(255,84,18,0) 60%), radial-gradient(90% 60% at 0% 0%, #3a2416, rgba(0,0,0,0) 70%), linear-gradient(180deg, #24150d, #120a06)`, text: "#fff", sub: "rgba(255,255,255,.82)", icon: ORANGE },
  light: { bg: `radial-gradient(110% 60% at 100% 100%, rgba(255,84,18,.30), rgba(255,84,18,0) 60%), linear-gradient(180deg, #fffaf5, #f8e6d6)`, text: "#1a120c", sub: "#5b4a3e", icon: ORANGE },
  orange: { bg: `radial-gradient(100% 60% at 50% 0%, #ff8a4c, rgba(255,138,76,0) 70%), linear-gradient(180deg, #ff6a26, #e9430b)`, text: "#fff", sub: "rgba(255,255,255,.92)", icon: "#fff" },
};

// Embedded, so the page needs no file access.
const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;

async function topColor(file) {
  // The status bar takes the colour of the top of the screen; light screens get dark icons.
  const { data } = await sharp(file).extract({ left: 6, top: 6, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return `rgb(${data[0]},${data[1]},${data[2]})`;
}
const isLight = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
};

function statusBar(color) {
  return `<div class="status" style="color:${color}">
    <span class="time">9:41</span>
    <span class="icons">
      <svg viewBox="0 0 18 12" width="54" height="36"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>
      <svg viewBox="0 0 16 12" width="48" height="36"><path d="M8 2.5c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8 .7 10.6 10.6 0 0 0 .5 3.7L1.8 5A8.8 8.8 0 0 1 8 2.5Zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.3-1.3A7 7 0 0 0 8 4.3a7 7 0 0 0-5 1.9l1.3 1.3c1-.9 2.3-1.4 3.7-1.4ZM8 9.7c-.6 0-1.1.2-1.5.6L8 11.8l1.5-1.5c-.4-.4-.9-.6-1.5-.6Z" fill="currentColor"/></svg>
      <svg viewBox="0 0 27 13" width="81" height="39"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".5"/></svg>
    </span>
  </div>`;
}

function html(p, size, top) {
  const { w, h } = size;
  const t = THEMES[p.theme];
  const k = w / 1320; // everything is designed on the 1320-wide canvas
  const H = h / k; // canvas height in design pixels (2868 for Apple, 2640 for Google Play)
  // "whole" panels show the entire phone (e.g. the reel's Order button): scaled down, resting near the bottom.
  const PHONE_H = 52 + 150 + (948 * 2532) / 1170; // bezel + status bar + screen, at 1000 px wide
  const scale = p.whole ? Math.min(0.86, (H - 880 - 70) / PHONE_H) : 1; // as big as fits under the headline
  const phoneTop = p.whole ? Math.round(H - PHONE_H * scale - 70) : p.brand ? 1220 : 1130;
  const metaFile = path.join(RAW, p.screen.replace(/\.png$/, ".json"));
  const hl = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")).highlight : null;
  const screenFile = path.join(RAW, p.screen);
  const head = p.brand
    ? `<svg class="logo" viewBox="0 0 ${logo.w} ${logo.h}"><path d="${logo.d}" fill="#fff"/></svg>
       <div class="title brandtitle">The <span style="color:${ORANGE}">Food Reel</span><br>App</div>
       <div class="swoosh"></div>
       <div class="sub">${p.sub}</div>`
    : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="${t.icon}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icons[p.icon]}</svg>
       <div class="title">${p.title.replace(/\n/g, "<br>")}</div>
       <div class="sub">${p.sub.replace(/\n/g, "<br>")}</div>`;
  // Phone: 1000 px wide on the 1320 canvas; the screen keeps the capture's 1170:2532 ratio under a status bar.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
  body { font-family: "Inter Display", "Inter", sans-serif; background: ${t.bg}; color: ${t.text}; -webkit-font-smoothing: antialiased; }
  .wrap { position: absolute; inset: 0; transform-origin: 0 0; transform: scale(${k}); width: 1320px; height: ${h / k}px; }
  .head { position: absolute; top: ${p.whole ? 110 : p.brand ? 150 : 170}px; left: 0; right: 0; text-align: center; padding: 0 80px; }
  .logo { height: ${p.whole ? 200 : 300}px; display: block; margin: 0 auto ${p.whole ? 44 : 70}px; }
  .icon { width: 150px; height: 150px; display: block; margin: 0 auto 60px; }
  .title { font-size: 150px; font-weight: 800; line-height: 1.02; letter-spacing: -4px; }
  .brandtitle { font-size: 128px; }
  .swoosh { width: 280px; height: 18px; border-radius: 99px; background: ${ORANGE}; margin: 44px auto 0; transform: rotate(-2deg); }
  .sub { margin-top: 48px; font-size: 62px; font-weight: 500; line-height: 1.3; color: ${t.sub}; }
  .phone { position: absolute; left: 50%; width: 1000px; top: ${phoneTop}px; transform: translateX(-50%) scale(${scale}) rotate(${p.tilt}deg); transform-origin: 50% 0;
           border-radius: 150px; padding: 26px; background: linear-gradient(145deg, #3b3b40, #0c0c0e 40%, #2a2a2e);
           box-shadow: 0 80px 160px rgba(0,0,0,.45), 0 0 0 6px rgba(255,255,255,.08) inset; }
  .screen { position: relative; border-radius: 126px; overflow: hidden; background: ${top}; }
  .screen img { display: block; width: 100%; }
  .shot { position: relative; }
  /* glow around the button the panel is about (the reel's Order button) */
  .ring { position: absolute; border-radius: 999px; box-shadow: 0 0 0 7px #fff, 0 0 0 16px rgba(255,84,18,.55), 0 0 90px 30px rgba(255,120,40,.85); }
  .island { position: absolute; top: 34px; left: 50%; transform: translateX(-50%); width: 300px; height: 88px; border-radius: 99px; background: #000; z-index: 3; }
  .status { height: 150px; display: flex; align-items: center; justify-content: space-between; padding: 30px 92px 0 110px; background: ${top}; }
  .time { font-size: 50px; font-weight: 700; letter-spacing: -.5px; }
  .icons { display: flex; gap: 14px; align-items: center; }
  </style></head><body><div class="wrap">
    <div class="head">${head}</div>
    <div class="phone"><div class="screen"><div class="island"></div>${statusBar(isLight(top) ? "#000" : "#fff")}<div class="shot"><img src="${dataUri(screenFile)}">${hl ? `<div class="ring" style="left:${hl.x * 100}%;top:${hl.y * 100}%;width:${hl.w * 100}%;height:${hl.h * 100}%"></div>` : ""}</div></div></div>
  </div></body></html>`;
}

// Google Play feature graphic (1024×500): logo, line, and the reels screen.
function featureHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1024px; height: 500px; overflow: hidden; }
  body { font-family: "Inter Display", "Inter", sans-serif; background: ${THEMES.dark.bg}; color: #fff; }
  .logo { position: absolute; left: 70px; top: 92px; height: 120px; }
  .t { position: absolute; left: 70px; top: 250px; font-size: 54px; font-weight: 800; letter-spacing: -1.5px; line-height: 1.05; }
  .s { position: absolute; left: 72px; top: 392px; font-size: 26px; font-weight: 500; color: rgba(255,255,255,.82); }
  .phone { position: absolute; right: 70px; top: 46px; width: 270px; transform: rotate(-6deg); border-radius: 42px; padding: 8px; background: linear-gradient(145deg,#3b3b40,#0c0c0e 40%,#2a2a2e); box-shadow: 0 30px 60px rgba(0,0,0,.5); }
  .phone img { display: block; width: 100%; border-radius: 34px; }
  </style></head><body>
    <svg class="logo" viewBox="0 0 ${logo.w} ${logo.h}"><path d="${logo.d}" fill="#fff"/></svg>
    <div class="t">The <span style="color:${ORANGE}">Food Reel</span> App</div>
    <div class="s">Watch · Discover · Order — Lebanon's restaurants</div>
    <div class="phone"><img src="${dataUri(path.join(RAW, "1-reels.png"))}"></div>
  </body></html>`;
}

(async () => {
  const sets = [
    { dir: "apple-6.9in", w: 1320, h: 2868 }, // iPhone 6.9" (App Store's required size)
    { dir: "google-play-phone", w: 1080, h: 2160 }, // Google Play: at most 2:1
  ];
  const b = await chromium.launch();
  for (const set of sets) {
    fs.mkdirSync(path.join(OUT, set.dir), { recursive: true });
    const page = await b.newPage({ viewport: { width: set.w, height: set.h }, deviceScaleFactor: 1 });
    for (const p of PANELS) {
      await page.setContent(html(p, set, await topColor(path.join(RAW, p.screen))), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(OUT, set.dir, `${p.id}.png`) });
      console.log(`${set.dir}/${p.id}.png  ${set.w}×${set.h}`);
    }
    await page.close();
  }
  const page = await b.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(featureHtml(), { waitUntil: "load" });
  await page.screenshot({ path: path.join(OUT, "google-play-feature-graphic-1024x500.png") });
  console.log("google-play-feature-graphic-1024x500.png");
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
