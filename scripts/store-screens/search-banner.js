// App Store search results image (3840×2560): logo and tagline beside two phones with real screens.
//   node scripts/store-screens/search-banner.js <raw screens dir> <output dir>
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { chromium } = require("playwright");

const [RAW, OUT] = process.argv.slice(2).map((p) => path.resolve(p));
const logo = JSON.parse(fs.readFileSync(path.join(__dirname, "logo.json"), "utf8"));
const uri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(RAW, f)).toString("base64")}`;
async function top(f) {
  const { data } = await sharp(path.join(RAW, f)).extract({ left: 6, top: 6, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

(async () => {
  const W = 3840, H = 2560;
  const tops = { "1-reels.png": await top("1-reels.png"), "4-dish.png": await top("4-dish.png") };
  const phone = (img, x, y, width, rot, z) => {
    const c = tops[img], light = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 > 150;
    return `<div class="phone" style="left:${x}px;top:${y}px;width:${width}px;transform:rotate(${rot}deg);z-index:${z}">
      <div class="screen"><div class="island"></div><div class="status" style="background:rgb(${c.join(",")});color:${light ? "#000" : "#fff"}"><span>9:41</span><span class="bars">▂▄▆█</span></div><img src="${uri(img)}"></div></div>`;
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: "Inter Display", "Inter", sans-serif; color: #fff; }
  body { background: radial-gradient(55% 70% at 78% 100%, rgba(255,84,18,.7), rgba(255,84,18,0) 70%), radial-gradient(45% 60% at 0% 0%, #3a2416, rgba(0,0,0,0) 70%), linear-gradient(180deg, #24150d, #120a06); }
  .logo { position: absolute; left: 280px; top: 620px; height: 520px; }
  .t { position: absolute; left: 280px; top: 1280px; font-size: 190px; font-weight: 800; letter-spacing: -6px; line-height: 1.02; }
  .t span { color: #ff5412; }
  .s { position: absolute; left: 288px; top: 1760px; font-size: 92px; font-weight: 500; color: rgba(255,255,255,.85); }
  .phone { position: absolute; border-radius: 120px; padding: 22px; background: linear-gradient(145deg, #3b3b40, #0c0c0e 40%, #2a2a2e); box-shadow: 0 80px 160px rgba(0,0,0,.55); }
  .screen { position: relative; border-radius: 100px; overflow: hidden; background: #000; }
  .screen img { display: block; width: 100%; }
  .status { height: 120px; display: flex; align-items: center; justify-content: space-between; padding: 28px 80px 0 96px; font-size: 44px; font-weight: 700; }
  .bars { font-size: 28px; letter-spacing: 3px; }
  .island { position: absolute; top: 28px; left: 50%; transform: translateX(-50%); width: 34%; height: 70px; border-radius: 99px; background: #000; z-index: 3; }
  </style></head><body>
    <svg class="logo" viewBox="0 0 ${logo.w} ${logo.h}"><path d="${logo.d}" fill="#fff"/></svg>
    <div class="t">The <span>Food Reel</span><br>App</div>
    <div class="s">Watch it. Crave it. Order it.</div>
    ${phone("4-dish.png", 2900, 330, 760, 7, 1)}
    ${phone("1-reels.png", 2100, 180, 860, -4, 2)}
  </body></html>`;
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: path.join(OUT, `app-store-search-${W}x${H}.png`) });
  await b.close();
  console.log(`app-store-search-${W}x${H}.png`);
})().catch((e) => { console.error(e); process.exit(1); });
