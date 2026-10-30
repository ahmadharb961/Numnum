// Regenerates the logo files and app icons from the vector paths in src/lib/logo.ts.
// Usage: node scripts/brand-assets.js   (needs Playwright's Chromium)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const src = fs.readFileSync(path.join(__dirname, "../src/lib/logo.ts"), "utf8");
const get = (name) => src.match(new RegExp(`export const ${name} = "([^"]+)"`))[1];
const NUM = get("NUM_PATH"), STACK = get("STACK_PATH");
const NUM_W = 913, NUM_H = 273, GAP = 15, ROW_W = NUM_W * 2 + GAP, STACK_W = 913, STACK_H = 548;
const ORANGE = "#ff5412", INK = "#16120f";

const rowSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ROW_W} ${NUM_H}"><g fill="${fill}"><path d="${NUM}"/><path transform="translate(${NUM_W + GAP} 0)" d="${NUM}"/></g></svg>`;
const stackSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STACK_W} ${STACK_H}"><path fill="${fill}" d="${STACK}"/></svg>`;
/** Orange square with the white two-line mark; `rx` rounds the corners, `w` is the mark width as a share of the square. */
const iconSvg = ({ rx = 0, w = 0.66 } = {}) => {
  const s = 512, mw = s * w, sc = mw / STACK_W, mh = STACK_H * sc;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${rx}" fill="${ORANGE}"/><path fill="#fff" transform="translate(${(s - mw) / 2} ${(s - mh) / 2}) scale(${sc})" d="${STACK}"/></svg>`;
};

const out = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};

(async () => {
  const root = path.join(__dirname, "..");
  const files = {
    "public/logo/numnum-orange.svg": rowSvg(ORANGE),
    "public/logo/numnum-white.svg": rowSvg("#fff"),
    "public/logo/numnum-stack-orange.svg": stackSvg(ORANGE),
    "public/logo/numnum-stack-white.svg": stackSvg("#fff"),
    "public/icons/icon.svg": iconSvg({ rx: 112 }),
    "brand/numnum-logo-orange.svg": rowSvg(ORANGE),
    "brand/numnum-logo-stack-orange.svg": stackSvg(ORANGE),
    "brand/numnum-instagram.svg": iconSvg({ w: 0.62 }),
  };
  for (const [p, svg] of Object.entries(files)) out(path.join(root, p), svg);

  const b = await chromium.launch();
  const page = await b.newPage();
  const png = async (svg, w, h, p, transparent = true) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<style>*{margin:0}html,body{background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`);
    out(path.join(root, p), await page.screenshot({ omitBackground: transparent, type: "png" }));
  };
  await png(iconSvg({ rx: 112 }), 192, 192, "public/icons/icon-192.png");
  await png(iconSvg({ rx: 112 }), 512, 512, "public/icons/icon-512.png");
  await png(iconSvg({ w: 0.64 }), 180, 180, "public/icons/apple-touch-icon.png", false);
  await png(iconSvg({ w: 0.56 }), 512, 512, "public/icons/maskable-512.png", false);
  await png(iconSvg({ rx: 112, w: 0.8 }), 32, 32, "public/favicon.png");
  // Emails can't show SVG: a PNG at 2× the size it's shown (160 px wide).
  await png(rowSvg(ORANGE), 320, Math.round((320 * NUM_H) / ROW_W), "public/logo/numnum-email.png");
  // Downloads for social media and print.
  await png(iconSvg({ w: 0.62 }), 2048, 2048, "brand/numnum-instagram-2048.png", false);
  await png(iconSvg({ rx: 112 }), 1024, 1024, "brand/numnum-app-icon-1024.png");
  for (const [name, fill] of [["orange", ORANGE], ["white", "#fff"], ["black", INK]]) {
    await png(stackSvg(fill), 2000, Math.round((2000 * STACK_H) / STACK_W), `brand/numnum-logo-stack-${name}.png`);
    await png(rowSvg(fill), 2400, Math.round((2400 * NUM_H) / ROW_W), `brand/numnum-logo-${name}.png`);
  }
  await b.close();
  console.log("brand assets written");
})();
