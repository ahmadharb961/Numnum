// Regenerates the logo files and app icons from the vector paths in src/lib/logo.ts.
// Usage: node scripts/brand-assets.js   (needs Playwright's Chromium)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const src = fs.readFileSync(path.join(__dirname, "../src/lib/logo.ts"), "utf8");
const get = (name) => src.match(new RegExp(`export const ${name} = "([^"]+)"`))[1];
const STACK = get("STACK_PATH");
const STACK_W = 913, STACK_H = 548;
const ORANGE = "#ff5412", INK = "#16120f";

const stackSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STACK_W} ${STACK_H}"><path fill="${fill}" d="${STACK}"/></svg>`;
/** Orange square with the white two-line mark; `rx` rounds the corners, `w` is the mark width as a share of the square. */
const iconSvg = ({ rx = 0, w = 0.66 } = {}) => {
  const s = 512, mw = s * w, sc = mw / STACK_W, mh = STACK_H * sc;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${rx}" fill="${ORANGE}"/><path fill="#fff" transform="translate(${(s - mw) / 2} ${(s - mh) / 2}) scale(${sc})" d="${STACK}"/></svg>`;
};

/** ICO file holding PNG images (supported by every current browser). */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2); // icon
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((buf, i) => {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // from the PNG IHDR chunk
    const e = 6 + 16 * i;
    head.writeUInt8(w >= 256 ? 0 : w, e);
    head.writeUInt8(h >= 256 ? 0 : h, e + 1);
    head.writeUInt8(0, e + 2); // palette
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); // planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(buf.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs]);
}

const out = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};

(async () => {
  const root = path.join(__dirname, "..");
  const files = {
    "public/logo/numnum-stack-orange.svg": stackSvg(ORANGE),
    "public/logo/numnum-stack-white.svg": stackSvg("#fff"),
    "public/icons/v2/icon.svg": iconSvg({ rx: 112 }),
    "brand/numnum-logo-orange.svg": stackSvg(ORANGE),
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
  await png(iconSvg({ rx: 112 }), 192, 192, "public/icons/v2/icon-192.png");
  await png(iconSvg({ rx: 112 }), 512, 512, "public/icons/v2/icon-512.png");
  await png(iconSvg({ w: 0.64 }), 180, 180, "public/icons/v2/apple-touch-icon.png", false);
  // iPhones also look for this at the site root.
  await png(iconSvg({ w: 0.64 }), 180, 180, "public/apple-touch-icon.png", false);
  await png(iconSvg({ w: 0.56 }), 512, 512, "public/icons/v2/maskable-512.png", false);
  await png(iconSvg({ rx: 112, w: 0.8 }), 32, 32, "public/favicon.png");
  // Browser tab icons: PNGs (Safari and some Android browsers don't show SVG favicons) and a
  // classic multi-size /favicon.ico, which browsers and search engines request on their own.
  for (const s of [16, 32, 48, 96]) await png(iconSvg({ rx: 112, w: 0.8 }), s, s, `public/icons/v2/favicon-${s}.png`);
  out(path.join(root, "public/favicon.ico"), ico([16, 32, 48].map((s) => fs.readFileSync(path.join(root, `public/icons/v2/favicon-${s}.png`)))));
  // Emails can't show SVG: a PNG at 2× the size it's shown (96 px wide).
  await png(stackSvg(ORANGE), 192, Math.round((192 * STACK_H) / STACK_W), "public/logo/numnum-email.png");
  // Downloads for social media and print.
  await png(iconSvg({ w: 0.62 }), 2048, 2048, "brand/numnum-instagram-2048.png", false);
  await png(iconSvg({ rx: 112 }), 1024, 1024, "brand/numnum-app-icon-1024.png");
  for (const [name, fill] of [["orange", ORANGE], ["white", "#fff"], ["black", INK]]) {
    await png(stackSvg(fill), 2000, Math.round((2000 * STACK_H) / STACK_W), `brand/numnum-logo-${name}.png`);
  }
  // Link preview (WhatsApp, Instagram, iMessage, Facebook…): 1200×630.
  {
    const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(`<style>*{margin:0}body{width:1200px;height:630px;background:${ORANGE};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff}svg{width:360px;height:auto;display:block}p{font-size:46px;font-weight:800;letter-spacing:-0.5px}small{font-size:28px;font-weight:600;opacity:.9;margin-top:-28px}</style>${stackSvg("#fff")}<p>Watch it. Crave it. Order it.</p><small>Lebanon's food in short videos · cash on delivery</small>`);
    out(path.join(root, "public/og.png"), await page.screenshot({ type: "png" }));
  }
  await b.close();
  console.log("brand assets written");
})();
