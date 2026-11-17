// Reel cover: a restaurant and a food creator pick it from the video's frames or upload a photo,
// and it stays the reel's cover after the video is processed.
// The test video is red (0–2 s), green (2–4 s) and blue (4–6 s): the cover's color shows which
// moment was picked.
//   BASE_URL=http://localhost:3000 node e2e/reel-cover.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium, devices } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let fails = 0;
const check = (c, m, x) => { console.log(`${c ? "✓" : "✗"} ${m}${c ? "" : " — got: " + JSON.stringify(x)}`); if (!c) fails++; };
const section = (s) => console.log(`\n${s}`);
let ip = 50;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nn-cover-"));
const VIDEO = path.join(dir, "rgb.webm");
const PHOTO = path.join(dir, "yellow.png");
const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
ff(["-f", "lavfi", "-i", "color=c=red:s=360x640:d=2:r=30", "-f", "lavfi", "-i", "color=c=lime:s=360x640:d=2:r=30", "-f", "lavfi", "-i", "color=c=blue:s=360x640:d=2:r=30", "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0,format=yuv420p", "-c:v", "libvpx-vp9", "-b:v", "300k", VIDEO]);
ff(["-f", "lavfi", "-i", "color=c=yellow:s=600x900", "-frames:v", "1", PHOTO]);

/** The main color of an image on the page: "red" | "green" | "blue" | "yellow" | other. */
const colorOf = (page, selector) =>
  page.evaluate(async (sel) => {
    const img = document.querySelector(sel);
    if (!img) return "none";
    if (!img.complete) await new Promise((r) => (img.onload = img.onerror = r));
    const c = document.createElement("canvas");
    c.width = 20; c.height = 20;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, 20, 20);
    const d = x.getImageData(0, 0, 20, 20).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; r /= n; g /= n; b /= n;
    if (r > 180 && g > 180 && b < 90) return "yellow";
    if (r > 150 && g < 90 && b < 90) return "red";
    if (g > 150 && r < 90 && b < 90) return "green";
    if (b > 150 && r < 90 && g < 90) return "blue";
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }, selector);

(async () => {
  const db = new PrismaClient();
  const b = await chromium.launch();
  const errors = [];
  async function as(email, password) {
    const ctx = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.5.9.${ip++}` } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${email} on ${p.url()}: ${String(e).slice(0, 160)}`));
    await p.addLocatorHandler(p.getByRole("dialog", { name: "How was your order?" }), async () => p.getByRole("button", { name: "Not now" }).click({ timeout: 3000 }).catch(() => {}));
    await p.goto("/login");
    await p.fill("#email", email);
    await p.fill("#password", password);
    await p.locator("form button[type=submit]").click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    return p;
  }
  // Open the frame picker, wait for the film strip, pick a frame (strip index), confirm.
  async function pickFrame(p, index, viaSlider) {
    await p.getByTestId("cover-from-video").click();
    await p.getByTestId("frame-picker").waitFor();
    await p.waitForFunction(() => document.querySelectorAll("[data-testid=cover-frame] img").length === 10, null, { timeout: 20000 });
    if (viaSlider) await p.getByTestId("cover-slider").fill(String(viaSlider));
    else await p.getByTestId("cover-frame").nth(index).click();
    await p.getByTestId("cover-use").click();
    await p.getByTestId("frame-picker").waitFor({ state: "detached", timeout: 20000 });
    await p.getByTestId("cover-preview").waitFor();
  }
  // Search the dish, tap it once the results are in, and wait until it shows as chosen.
  async function pickDish(p) {
    await p.getByTestId("dish-search").fill("Double Smash");
    await p.getByTestId("dish-result").filter({ hasText: "Burger House" }).first().waitFor();
    await p.waitForTimeout(400); // results settle (search runs as you type)
    await p.evaluate(() => window.scrollBy(0, 400)); // above the bottom bar
    await p.getByTestId("dish-result").filter({ hasText: "Burger House" }).first().click();
    await p.getByTestId("picked-dish").waitFor({ timeout: 8000 }).catch(async (e) => {
      await p.screenshot({ path: (process.env.SHOTS || "/tmp") + "/cover-dish-fail.png" });
      console.log("dish results:", await p.getByTestId("dish-result").allTextContents());
      throw e;
    });
  }
  const waitReady = async (id) => {
    for (let i = 0; i < 60; i++) {
      const r = await db.reel.findUnique({ where: { id }, select: { status: true, posterUrl: true, videoAsset: { select: { posterUrl: true } } } });
      if (r && r.status !== "PROCESSING") return r;
      await new Promise((res) => setTimeout(res, 1000));
    }
    return db.reel.findUnique({ where: { id }, select: { status: true, posterUrl: true, videoAsset: { select: { posterUrl: true } } } });
  };

  section("Restaurant: cover from the video's frames");
  {
    const p = await as("owner@burgerhouse.demo", "demo1234");
    await p.goto("/dashboard/reels/new", { waitUntil: "networkidle" });
    await p.locator("input[type=file][accept*=video]").setInputFiles(VIDEO);
    await p.getByTestId("cover-picker").waitFor();
    check((await p.getByTestId("cover-picker").getByText("Automatic").count()) === 1, "before choosing, the cover is automatic");
    // The film strip shows the whole video: red at the start, blue at the end.
    await p.getByTestId("cover-from-video").click();
    await p.waitForFunction(() => document.querySelectorAll("[data-testid=cover-frame] img").length === 10, null, { timeout: 20000 });
    check((await colorOf(p, "[data-testid=cover-frame]:nth-child(1) img")) === "red", "film strip: first frame is red", await colorOf(p, "[data-testid=cover-frame]:nth-child(1) img"));
    check((await colorOf(p, "[data-testid=cover-frame]:nth-child(10) img")) === "blue", "film strip: last frame is blue", await colorOf(p, "[data-testid=cover-frame]:nth-child(10) img"));
    await p.getByTestId("cover-frame").nth(5).click(); // 3.3 s: green
    await p.getByTestId("cover-use").click();
    await p.getByTestId("cover-preview").waitFor({ timeout: 20000 });
    check((await colorOf(p, "[data-testid=cover-preview]")) === "green", "tapping a frame in the strip → that frame is the cover", await colorOf(p, "[data-testid=cover-preview]"));
    // Change it with the slider (any moment, not just the strip's frames).
    await pickFrame(p, 0, 5.5);
    check((await colorOf(p, "[data-testid=cover-preview]")) === "blue", "the slider picks any moment (5.5 s → blue)", await colorOf(p, "[data-testid=cover-preview]"));
    await p.getByText("Uploaded").waitFor({ timeout: 60000 });
    await p.getByPlaceholder("Search your menu").fill("Double Smash");
    await p.getByRole("button", { name: /Double Smash Burger/ }).first().click();
    await p.getByRole("button", { name: "Save reel" }).click();
    await p.waitForURL(/\/dashboard\/reels\/(?!new)[a-z0-9]+$/, { timeout: 30000 }).catch(async () => console.log("not saved:", p.url(), await p.locator("[role=alert], .text-red-600").allTextContents()));
    const id = p.url().split("/").pop();
    const r = await waitReady(id);
    check(r?.status === "READY", "the video is processed", r?.status);
    check(!!r?.posterUrl && r.posterUrl !== r.videoAsset?.posterUrl, "the reel keeps the chosen cover, not the automatic one", r);
    // Customers see the cover in the restaurant's reel grid (the reel was published automatically).
    const pub = await db.reel.findUnique({ where: { id }, select: { visibility: true } });
    check(pub?.visibility === "PUBLISHED", "published after processing", pub);
    await p.goto("/r/burger-house#reels", { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    const shown = await p.evaluate((u) => [...document.querySelectorAll("img")].some((e) => (e.getAttribute("src") || "") === u), r.posterUrl);
    check(shown, "the restaurant's reel grid shows the chosen cover", r.posterUrl);
    await p.context().close();
  }

  section("Food creator: cover from the gallery, then back to automatic, then a frame");
  {
    const p = await as("mrfoodies@numnum.demo", "demo1234");
    await p.goto("/creator/new", { waitUntil: "networkidle" });
    await p.getByTestId("video-input").setInputFiles(VIDEO);
    await p.getByTestId("cover-picker").waitFor();
    await p.getByTestId("cover-input").setInputFiles(PHOTO);
    await p.getByTestId("cover-preview").waitFor({ timeout: 20000 });
    check((await colorOf(p, "[data-testid=cover-preview]")) === "yellow", "a photo from the gallery is the cover", await colorOf(p, "[data-testid=cover-preview]"));
    await p.getByTestId("cover-reset").click();
    check((await p.getByTestId("cover-preview").count()) === 0 && (await p.getByTestId("cover-picker").getByText("Automatic").count()) === 1, "'Use the automatic cover' goes back to automatic");
    await pickFrame(p, 0);
    check((await colorOf(p, "[data-testid=cover-preview]")) === "red", "frame picked (first: red)", await colorOf(p, "[data-testid=cover-preview]"));
    await p.getByTestId("cover-input").setInputFiles(PHOTO);
    await p.waitForFunction(() => document.querySelector("[data-testid=cover-preview]")?.getAttribute("src")?.length > 0, null, { timeout: 20000 });
    await p.waitForTimeout(500);
    check((await colorOf(p, "[data-testid=cover-preview]")) === "yellow", "replaced by a gallery photo", await colorOf(p, "[data-testid=cover-preview]"));
    await p.getByText("Uploaded").waitFor({ timeout: 60000 });
    await pickDish(p);
    await p.getByTestId("post-reel").click();
    await p.waitForURL((u) => u.pathname === "/creator", { timeout: 30000 }).catch(async () => console.log("not posted:", await p.locator("[role=alert], .text-red-600").allTextContents()));
    const reel = await db.reel.findFirst({ where: { creator: { handle: "mr.foodies" } }, orderBy: { createdAt: "desc" }, select: { id: true } });
    const r = await waitReady(reel.id);
    const me = await db.user.findUnique({ where: { email: "mrfoodies@numnum.demo" }, select: { id: true } });
    const asset = r?.posterUrl ? await db.mediaAsset.findFirst({ where: { url: r.posterUrl }, select: { kind: true, uploadedById: true } }) : null;
    check(r?.status === "READY" && asset?.kind === "IMAGE" && asset.uploadedById === me.id, "the creator's reel keeps their photo as cover after processing", { r, asset });
    await p.context().close();
  }

  section("Someone else's image can't be used as a cover");
  {
    const other = await db.mediaAsset.findFirst({ where: { kind: "IMAGE", restaurantId: { not: null } }, select: { id: true } });
    const p = await as("mrfoodies@numnum.demo", "demo1234");
    await p.goto("/creator/new", { waitUntil: "networkidle" });
    await p.getByTestId("video-input").setInputFiles(VIDEO);
    await p.getByText("Uploaded").waitFor({ timeout: 60000 });
    // Swap the picked cover's id for a restaurant's image just before posting.
    await p.getByTestId("cover-input").setInputFiles(PHOTO);
    await p.getByTestId("cover-preview").waitFor({ timeout: 20000 });
    await p.route("**/creator/new", async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.continue();
      const body = req.postData() || "";
      const swapped = body.replace(/"posterAssetId":"[^"]+"/, `"posterAssetId":"${other.id}"`);
      return route.continue({ postData: swapped });
    });
    await pickDish(p);
    await p.getByTestId("post-reel").click();
    await p.waitForURL((u) => u.pathname === "/creator", { timeout: 30000 });
    const reel = await db.reel.findFirst({ where: { creator: { handle: "mr.foodies" } }, orderBy: { createdAt: "desc" }, select: { posterUrl: true } });
    const otherUrl = (await db.mediaAsset.findUnique({ where: { id: other.id }, select: { url: true } })).url;
    check(reel.posterUrl !== otherUrl, "a restaurant's image id is ignored", reel.posterUrl);
    await p.context().close();
  }

  check(!errors.length, "no page errors", errors);
  await b.close();
  await db.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
