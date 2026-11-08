// Generates the PWA icons and the default Open Graph image from SVG.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const mark = (bg, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${bg === "none" ? 0 : 112}" fill="${bg === "none" ? "#8125e8" : bg}"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 64})">
    <g stroke="#ffd43b" stroke-width="4" stroke-linecap="round"><path d="M3 25h7"/><path d="M1 33h8"/><path d="M5 41h5"/></g>
    <path d="M24 8h26c6.6 0 12 5.4 12 12v18c0 6.6-5.4 12-12 12H33l-11 9c-1.3 1.1-3.3.1-3.2-1.6l.6-7.7C15.3 48.5 12 44.5 12 39.6V20c0-6.6 5.4-12 12-12z" fill="#ffd43b"/>
    <path d="M25 29.5l7 7 13.5-13.5" fill="none" stroke="#8125e8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const out = "public/icons";
const rounded = Buffer.from(mark("#8125e8", 72));
const full = Buffer.from(mark("none", 120)); // maskable: square, extra safe zone

writeFileSync(`${out}/icon.svg`, mark("#8125e8", 72).trim());
await sharp(rounded).resize(192, 192).png().toFile(`${out}/icon-192.png`);
await sharp(rounded).resize(512, 512).png().toFile(`${out}/icon-512.png`);
await sharp(full).resize(512, 512).png().toFile(`${out}/maskable-512.png`);
await sharp(full).resize(180, 180).png().toFile(`${out}/apple-touch-icon.png`);
await sharp(rounded).resize(48, 48).png().toFile(`public/favicon.png`);

const og = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8125e8"/><stop offset="1" stop-color="#5b16a6"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1100" cy="80" r="220" fill="#ffffff" opacity=".08"/>
  <g transform="translate(90 170) scale(2.6)">
    <g stroke="#ffd43b" stroke-width="4" stroke-linecap="round"><path d="M3 25h7"/><path d="M1 33h8"/><path d="M5 41h5"/></g>
    <path d="M24 8h26c6.6 0 12 5.4 12 12v18c0 6.6-5.4 12-12 12H33l-11 9c-1.3 1.1-3.3.1-3.2-1.6l.6-7.7C15.3 48.5 12 44.5 12 39.6V20c0-6.6 5.4-12 12-12z" fill="#ffd43b"/>
    <path d="M25 29.5l7 7 13.5-13.5" fill="none" stroke="#8125e8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="290" y="290" font-family="Helvetica, Arial, sans-serif" font-size="120" font-weight="800" fill="#fff">Yalla Ok</text>
  <text x="96" y="430" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="700" fill="#fff">Post it. Get it done.</text>
  <text x="96" y="500" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#fff" opacity=".8">Live tasks people will pay to have done. Chat on WhatsApp.</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile("public/og.png");
console.log("icons written");
