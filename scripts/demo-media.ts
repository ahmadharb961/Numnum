/* eslint-disable no-console */
// Pre-renders demo media (menu photos, logos, covers, 9:16 promo reels + posters) into
// prisma/demo/, which is committed so production deploys don't need ffmpeg or emoji fonts.
// Needs ffmpeg and an emoji font (Noto Color Emoji). Run after changing prisma/demo-data.ts:
//   npm run demo:media
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DEMOS, PALETTES } from "../prisma/demo-data";
import { formatMoney } from "../src/lib/money";

const OUT = path.join(__dirname, "..", "prisma", "demo");
const FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf";
const FONT_SEMI = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf";
const force = process.argv.includes("--force");

const EMOJI_TTF = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf";

// librsvg (sharp's SVG renderer) draws color emoji in black, so emoji are rendered in color
// with Pillow (NotoColorEmoji bitmaps) and embedded as images.
const emojiCache = new Map<string, string>();
function emojiHref(emoji: string) {
  let uri = emojiCache.get(emoji);
  if (!uri) {
    const py = `import sys,io,base64
from PIL import Image,ImageDraw,ImageFont
f=ImageFont.truetype(sys.argv[1],109)
im=Image.new("RGBA",(160,160),(0,0,0,0))
ImageDraw.Draw(im).text((80,80),sys.argv[2],font=f,embedded_color=True,anchor="mm")
im=im.crop(im.getbbox()).resize((512,512),Image.LANCZOS)
b=io.BytesIO();im.save(b,"PNG");print(base64.b64encode(b.getvalue()).decode())`;
    uri = `data:image/png;base64,${execFileSync("python3", ["-c", py, EMOJI_TTF, emoji], { maxBuffer: 16 * 1024 * 1024 }).toString().trim()}`;
    emojiCache.set(emoji, uri);
  }
  return uri;
}
const emojiImg = (emoji: string, cx: number, cy: number, size: number, extra = "") =>
  `<image href="${emojiHref(emoji)}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" ${extra}/>`;

function background(w: number, h: number, [a, b]: string[], pattern = "") {
  return `<defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="85%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>
      <radialGradient id="shadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="plate" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e4de"/></radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>${pattern}`;
}

function scatter(w: number, h: number, emoji: string, size: number, step: number) {
  let out = "";
  for (let y = step / 2, row = 0; y < h + step; y += step, row++) {
    for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
      out += emojiImg(emoji, x, y, size, `opacity="0.14" transform="rotate(-14 ${x} ${y})"`);
    }
  }
  return out;
}

function plate(cx: number, cy: number, r: number, emoji: string) {
  return `<ellipse cx="${cx}" cy="${cy + r * 0.18}" rx="${r * 1.12}" ry="${r * 1.0}" fill="url(#shadow)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#plate)"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="none" stroke="#000" stroke-opacity="0.06" stroke-width="${r * 0.025}"/>
    ${emojiImg(emoji, cx, cy, r * 1.15)}`;
}

async function jpeg(svg: string, file: string, quality = 82) {
  await sharp(Buffer.from(svg)).jpeg({ quality, mozjpeg: true }).toFile(file);
}

async function photo(emoji: string, idx: number, file: string) {
  const pal = PALETTES[idx % PALETTES.length];
  await jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">${background(1200, 900, pal, scatter(1200, 900, emoji, 70, 190))}${plate(600, 430, 300, emoji)}</svg>`, file);
}

async function logo(emoji: string, idx: number, file: string) {
  const pal = PALETTES[idx % PALETTES.length];
  await jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">${background(400, 400, pal)}${emojiImg(emoji, 200, 200, 240)}</svg>`, file, 88);
}

// A spread of three dishes; no text (the app shows the name) and the bottom-left kept clear for the logo.
async function cover(emojis: string[], idx: number, file: string) {
  const pal = PALETTES[idx % PALETTES.length];
  const [a, b, c] = [emojis[0], emojis[1] ?? emojis[0], emojis[2] ?? emojis[0]];
  await jpeg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">${background(1200, 675, pal, scatter(1200, 675, a, 70, 200))}${plate(1010, 380, 165, c)}${plate(440, 360, 175, b)}${plate(725, 320, 205, a)}</svg>`,
    file,
  );
}

async function reel(opts: { restaurant: string; dish: string; price: string; emoji: string; idx: number; video: string; poster: string; tmp: string }) {
  const pal = PALETTES[opts.idx % PALETTES.length];
  const still = path.join(opts.tmp, `still-${opts.idx}.png`);
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${background(1080, 1920, pal, scatter(1080, 1920, opts.emoji, 80, 220))}${plate(540, 900, 270, opts.emoji)}</svg>`))
    .png()
    .toFile(still);
  await sharp(still).resize(720, 1280).jpeg({ quality: 80, mozjpeg: true }).toFile(opts.poster);

  const txt = (name: string, v: string) => {
    const f = path.join(opts.tmp, `${name}-${opts.idx}.txt`);
    writeFileSync(f, v);
    return f;
  };
  const dishSize = Math.min(62, Math.floor(1150 / Math.max(10, opts.dish.length)));
  const fade = (start: number) => `alpha='min(1,max(0,(t-${start})/0.5))'`;
  // Text sits in the upper half: the app overlays the dish name, price and Order button on the lower part.
  const filters = [
    "scale=1620:2880",
    "zoompan=z='1+0.06*on/240':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=30",
    `drawtext=fontfile=${FONT_SEMI}:textfile=${txt("r", opts.restaurant.toUpperCase())}:fontsize=28:fontcolor=white@0.9:x=(w-tw)/2:y=215:${fade(0.2)}`,
    `drawtext=fontfile=${FONT_BOLD}:textfile=${txt("d", opts.dish)}:fontsize=${dishSize}:fontcolor=white:borderw=2:bordercolor=black@0.2:x=(w-tw)/2:y='258+20*max(0,1-(t-0.6)/0.5)':${fade(0.6)}`,
    `drawtext=fontfile=${FONT_BOLD}:textfile=${txt("p", opts.price)}:fontsize=38:fontcolor=0x16120f:box=1:boxcolor=white@0.95:boxborderw=16:x=(w-tw)/2:y=350:${fade(1.3)}`,
  ].join(",");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-loop", "1", "-framerate", "30", "-t", "8", "-i", still,
    "-f", "lavfi", "-t", "8", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-vf", filters,
    "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "32k", "-shortest", "-movflags", "+faststart",
    opts.video,
  ]);
}

async function main() {
  for (const d of ["photos", "logos", "covers", "reels"]) mkdirSync(path.join(OUT, d), { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nn-demo-media-"));
  let idx = 0;
  for (const [ri, d] of DEMOS.entries()) {
    const currency = d.currency ?? "USD";
    const lg = path.join(OUT, "logos", `${d.slug}.jpg`);
    if (force || !existsSync(lg)) await logo(d.items[0].emoji, ri, lg);
    const cv = path.join(OUT, "covers", `${d.slug}.jpg`);
    if (force || !existsSync(cv)) await cover([...new Set(d.items.map((i) => i.emoji))].slice(0, 3), ri + 1, cv);
    for (const it of d.items) {
      const ph = path.join(OUT, "photos", `${d.slug}-${it.sku}.jpg`);
      if (force || !existsSync(ph)) await photo(it.emoji, idx, ph);
      idx++;
    }
    for (const [vi, sku] of d.reels.entries()) {
      const it = d.items.find((x) => x.sku === sku)!;
      const video = path.join(OUT, "reels", `${d.slug}-${sku}.mp4`);
      if (!force && existsSync(video)) continue;
      await reel({ restaurant: d.name, dish: it.name, price: formatMoney(it.price, currency), emoji: it.emoji, idx: ri * 3 + vi + 2, video, poster: video.replace(/\.mp4$/, ".jpg"), tmp });
      console.log("reel", path.basename(video));
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log("Demo media written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
