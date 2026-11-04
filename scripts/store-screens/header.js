// App Store product page header (the wide image at the top of the listing): three phones with real
// numnum screens on the brand background. No text: Apple shows the app's name and Get button over it.
//   node scripts/store-screens/header.js <raw screens dir> <output dir>
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const [RAW, OUT] = process.argv.slice(2).map((p) => path.resolve(p));
const sharp = require("sharp");
// Status bar colour = top of the screen; light screens get dark text.
async function topColor(f) {
  const { data } = await sharp(path.join(RAW, f)).extract({ left: 6, top: 6, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}
const uri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(RAW, f)).toString("base64")}`;

function html(w, h, tops) {
  const k = h / 1646; // designed on 3840×1646
  const phone = (img, x, y, width, rot, z) => `
    <div class="phone" style="left:${x}px;top:${y}px;width:${width}px;transform:rotate(${rot}deg);z-index:${z}">
      <div class="screen"><div class="island"></div>
        <div class="status" style="background:rgb(${tops[img].join(",")});color:${tops[img][0] * 0.299 + tops[img][1] * 0.587 + tops[img][2] * 0.114 > 150 ? "#000" : "#fff"}"><span>9:41</span><span class="bars">▂▄▆█</span></div>
        <img src="${uri(img)}"></div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
  body { background: radial-gradient(60% 90% at 50% 110%, rgba(255,84,18,.65), rgba(255,84,18,0) 70%), radial-gradient(40% 60% at 15% 0%, #3a2416, rgba(0,0,0,0) 70%), linear-gradient(180deg, #24150d, #120a06); }
  .wrap { position: absolute; left: 50%; top: 0; width: 3840px; height: 1646px; transform: translateX(-50%) scale(${k}); transform-origin: 50% 0; }
  .phone { position: absolute; border-radius: 96px; padding: 18px; background: linear-gradient(145deg, #3b3b40, #0c0c0e 40%, #2a2a2e); box-shadow: 0 60px 120px rgba(0,0,0,.55); }
  .screen { position: relative; border-radius: 80px; overflow: hidden; background: #000; }
  .screen img { display: block; width: 100%; }
  .status { height: 96px; display: flex; align-items: center; justify-content: space-between; padding: 22px 64px 0 76px; font: 700 34px "Inter Display", "Inter", sans-serif; }
  .bars { font-size: 22px; letter-spacing: 2px; }
  .island { position: absolute; top: 22px; left: 50%; transform: translateX(-50%); width: 34%; height: 56px; border-radius: 99px; background: #000; z-index: 3; }
  </style></head><body><div class="wrap">
    ${phone("2-explore.png", 1020, 330, 600, -8, 1)}
    ${phone("1-reels.png", 1590, 150, 680, 0, 3)}
    ${phone("4-dish.png", 2240, 330, 600, 8, 1)}
  </div></body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  for (const [w, h] of [[3840, 1646], [5244, 2950]]) {
    const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const tops = {};
    for (const f of ["2-explore.png", "1-reels.png", "4-dish.png"]) tops[f] = await topColor(f);
    await page.setContent(html(w, h, tops), { waitUntil: "load" });
    await page.screenshot({ path: path.join(OUT, `app-store-header-${w}x${h}.png`) });
    console.log(`app-store-header-${w}x${h}.png`);
    await page.close();
  }
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
