// Profile photo: placed by hand in its circle (drag + zoom), only that part is kept.
// Pull to refresh: pulling a page down from the top reloads it in place (not on reel feeds).
//   BASE_URL=http://localhost:3000 node e2e/avatar-pull.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const settle = (p) => p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15000 }).catch(() => {});

// A photo in four colored quarters: red top-left, green top-right, blue bottom-left, yellow bottom-right.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nn-avatar-"));
const PHOTO = path.join(dir, "quarters.png");
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=red:s=400x300", "-f", "lavfi", "-i", "color=lime:s=400x300", "-f", "lavfi", "-i", "color=blue:s=400x300", "-f", "lavfi", "-i", "color=yellow:s=400x300", "-filter_complex", "[0][1]hstack[t];[2][3]hstack[b];[t][b]vstack", "-frames:v", "1", PHOTO]);

const colorAt = (page, sel, fx, fy) =>
  page.evaluate(async ({ sel, fx, fy }) => {
    const img = [...document.querySelectorAll(sel)].find((e) => e.offsetParent); // the visible one (a streamed page can hold a hidden copy)
    if (!img) return "none";
    if (!img.complete) await new Promise((r) => (img.onload = img.onerror = r));
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const [r, g, b] = x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
    if (r > 180 && g > 180 && b < 90) return "yellow";
    if (r > 150 && g < 90 && b < 90) return "red";
    if (g > 150 && r < 90 && b < 90) return "green";
    if (b > 150 && r < 90 && g < 90) return "blue";
    return `rgb(${r},${g},${b})`;
  }, { sel, fx, fy });

// A finger pulling the page down from y0 by dy (touch events, as on a phone).
async function pull(page, dy) {
  const cdp = await page.context().newCDPSession(page);
  const x = 195, y0 = 420; // mid-screen, below search boxes (a pull doesn't start on a text field)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + (dy * i) / 10 }] });
  return { end: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) };
}

(async () => {
  const db = new PrismaClient();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.4.5.5" } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.goto("/login");
  await p.fill("#email", "mrfoodies@numnum.demo");
  await p.fill("#password", "demo1234");
  await p.locator("form button[type=submit]").click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

  console.log("\nProfile photo, placed by hand");
  await p.goto("/creator/profile", { waitUntil: "load" }); await settle(p);
  const before = (await db.creator.findFirst({ where: { handle: "mr.foodies" }, select: { avatarUrl: true } })).avatarUrl;
  const avatar = "[data-testid=creator-form] button img";
  const oldSrc = await p.locator(`${avatar} >> visible=true`).first().getAttribute("src").catch(() => null);
  await p.getByTestId("avatar-input").setInputFiles(PHOTO);
  await p.getByTestId("avatar-cropper").waitFor();
  await p.locator("[data-testid=crop-area][data-ready]").waitFor(); // the photo is shown
  await p.waitForTimeout(600); // the sheet has finished sliding up
  check(true, "choosing a photo opens 'Place your photo' (nothing is uploaded yet)");
  // Zoom in, then drag the photo down-right so its top-left (red) quarter fills the circle.
  await p.getByTestId("crop-zoom").fill("2.5");
  const box = await p.getByTestId("crop-area").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.mouse.move(cx + 400, cy + 400, { steps: 12 }); // further than the photo allows: it stops at its edge
  await p.mouse.up();
  await p.getByTestId("crop-save").click();
  await p.getByTestId("avatar-cropper").waitFor({ state: "detached", timeout: 20000 });
  await p.waitForFunction(({ sel, old }) => { const i = [...document.querySelectorAll(sel)].find((e) => e.offsetParent); return i && i.getAttribute("src") !== old && i.complete && i.naturalWidth > 0; }, { sel: avatar, old: oldSrc }, { timeout: 20000 });
  check((await colorAt(p, avatar, 0.5, 0.5)) === "red" && (await colorAt(p, avatar, 0.9, 0.9)) === "red", "the saved photo is the part placed in the circle (the red corner)", [await colorAt(p, avatar, 0.5, 0.5), await colorAt(p, avatar, 0.9, 0.9)]);
  const dims = await p.evaluate((sel) => { const i = [...document.querySelectorAll(sel)].find((e) => e.offsetParent); return [i.naturalWidth, i.naturalHeight]; }, avatar);
  check(dims[0] === dims[1], "and it's square", dims);
  // Cancel keeps the current photo.
  const shown = await p.locator(`${avatar} >> visible=true`).first().getAttribute("src");
  await p.getByTestId("avatar-input").setInputFiles(PHOTO);
  await p.getByTestId("avatar-cropper").waitFor();
  await p.getByRole("button", { name: "Cancel" }).click();
  await p.getByTestId("avatar-cropper").waitFor({ state: "detached" });
  check((await p.locator(`${avatar} >> visible=true`).first().getAttribute("src")) === shown, "Cancel keeps the photo as it was");
  await p.getByRole("button", { name: "Save profile" }).click();
  await p.waitForURL((u) => u.pathname === "/creator", { timeout: 15000 });
  const after = (await db.creator.findFirst({ where: { handle: "mr.foodies" }, select: { avatarUrl: true } })).avatarUrl;
  check(after && after !== before, "saved on the profile", { before, after });

  console.log("\nPull to refresh");
  for (const page of ["/creator/restaurants", "/account", "/explore?type=creators", "/c/mr.foodies"]) {
    await p.goto(page, { waitUntil: "load" }); await settle(p); await p.waitForTimeout(1500);
    const reloads = [];
    const onReq = (r) => { const u = r.url(); if ((r.headers().rsc && !r.headers()["next-router-prefetch"] && new URL(u).pathname === new URL(p.url()).pathname) || u.includes("/api/search")) reloads.push(u); };
    p.on("request", onReq);
    const f = await pull(p, 60); // a short pull: nothing happens
    check(await p.getByTestId("pull-refresh").isVisible(), `${page}: the spinner follows the finger`);
    await f.end();
    await p.waitForTimeout(500);
    check((await p.getByTestId("pull-refresh").count()) === 0 && reloads.length === 0, `${page}: a short pull doesn't refresh`, reloads);
    const at = p.url();
    const g = await pull(p, 260); // past the line
    await g.end();
    const t0 = Date.now();
    await p.getByTestId("pull-refresh").waitFor({ state: "detached", timeout: 15000 });
    const took = Date.now() - t0;
    check(took < 3000, `${page}: the spinner goes away once refreshed (${took} ms)`, took);
    check(p.url() === at, `${page}: pulling doesn't open anything`, p.url());
    check(reloads.length > 0, `${page}: a long pull refreshes the page in place`, reloads.length);
    p.off("request", onReq);
  }
  // Explore also loads its search results again.
  // Not on reel feeds: there a swipe moves between videos.
  await p.goto("/", { waitUntil: "load" }); await settle(p); await p.waitForTimeout(1500);
  const h = await pull(p, 260);
  check((await p.getByTestId("pull-refresh").count()) === 0, "home reel feed: no pull to refresh");
  await h.end();

  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
