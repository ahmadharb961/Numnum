// Cloudflare Images, success path in a real browser: Admin → Settings moves every photo, every page then
// shows them from Cloudflare, new uploads go straight there. Uses a stand-in for Cloudflare's API (started here
// on :4555) and a COPY of the demo database. Start the app first with:
//   DATABASE_URL=<copy> CLOUDFLARE_ACCOUNT_ID=acc1 CLOUDFLARE_STREAM_API_TOKEN=tok CLOUDFLARE_API_BASE=http://localhost:4555 next start -p 3001
// then: CFE2E_DB=<copy> BASE_URL=http://localhost:4000 node e2e/cloudflare-images.js
const http = require("http");
const { chromium, devices } = require("playwright"); const { PrismaClient } = require("@prisma/client");
const stored = new Map(); let variant = false; let uploads = 0;
http.createServer((req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
    const send = (s, b) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    const p = req.url.replace(/^\/accounts\/acc1\/images/, "");
    if (req.url === "/_stats") return send(200, { uploads, stored: stored.size, variant });
    if (p === "/v1/variants/orig") return variant ? send(200, { success: true, result: {} }) : send(404, { success: false, errors: [{ code: 5404, message: "not found" }] });
    if (p === "/v1/variants" && req.method === "POST") { variant = true; return send(200, { success: true, result: {} }); }
    if (p === "/v1" && req.method === "POST") {
      const body = Buffer.concat(chunks).toString("latin1"); const id = /name="id"\r\n\r\n([^\r]+)/.exec(body)?.[1];
      if (!id) return send(400, { success: false, errors: [{ code: 1, message: "no id" }] });
      if (stored.has(id)) return send(409, { success: false, errors: [{ code: 5409, message: "Resource already exists" }] });
      stored.set(id, true); uploads++;
      return send(200, { success: true, result: { id, variants: [`https://imagedelivery.net/HASH1/${id}/orig`] } });
    }
    send(404, { success: false, errors: [{ code: 404, message: "unexpected " + req.method + " " + p }] });
  });
}).listen(4555);
const BASE = process.env.BASE_URL || "http://localhost:4000";
const db = new PrismaClient({ datasources: { db: { url: process.env.CFE2E_DB } } });
const ck = (c, m, x) => console.log((c ? "✓ " : "✗ ") + m + (c ? "" : " — " + x));
// Cloudflare's delivery network stands in: imagedelivery.net/HASH1/<id>/orig → our stored copy of <id>
const serveFromUs = (ctx) => ctx.route("https://imagedelivery.net/**", async (route) => {
  const m = /imagedelivery\.net\/HASH1\/([^/]+?)(_t)?\/orig/.exec(route.request().url());
  const r = await ctx.request.get(`${BASE}/media/i/${m[1]}${m[2] || ""}.webp`);
  await route.fulfill({ status: r.status(), body: await r.body(), headers: { "content-type": "image/webp", "access-control-allow-origin": "*" } });
});
(async () => { const b = await chromium.launch();
  const total = await db.mediaAsset.count({ where: { kind: "IMAGE", isPrivate: false, url: { startsWith: "/media/i/" } } });
  const actx = await b.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); const a = await actx.newPage();
  await a.goto("/login"); await a.fill("#email", "admin@numnum.app"); await a.fill("#password", "admin1234");
  await Promise.all([a.waitForURL((u) => !u.pathname.startsWith("/login")), a.getByRole("button", { name: "Log in" }).click()]);
  await a.goto("/admin/settings", { waitUntil: "networkidle" });
  ck(Number(await a.getByTestId("photos-server").innerText()) === total, `Admin shows ${total} photos on the server`, await a.getByTestId("photos-server").innerText());
  const t0 = Date.now(); await a.getByTestId("move-photos").click();
  await a.waitForFunction(() => document.querySelector('[data-testid="photos-server"]')?.textContent === "0", null, { timeout: 300000 });
  ck(true, `all photos moved in ${Math.round((Date.now() - t0) / 1000)} s (batches of 8)`);
  ck(Number(await a.getByTestId("photos-cloudflare").innerText()) === total, "Admin now shows them on Cloudflare", await a.getByTestId("photos-cloudflare").innerText());
  ck(!(await a.getByTestId("photos-error").count()), "no error shown", "");
  // nothing anywhere still points at the server copy
  const left = await db.$queryRawUnsafe(`select (select count(*) from restaurants where "logoUrl" like '/media/i/%' or "coverUrl" like '/media/i/%') r, (select count(*) from reels where "posterUrl" like '/media/i/%') re, (select count(*) from notifications where "imageUrl" like '/media/i/%') n, (select count(*) from push_broadcasts where "imageUrl" like '/media/i/%') pb, (select count(*) from media_assets where url like '/media/i/%' and "isPrivate" = false) ma`);
  // (only photos that still exist can move: a notification may point at a deleted one)
  ck(Number(left[0].r) + Number(left[0].re) + Number(left[0].ma) === 0, "no restaurant, reel or photo address left pointing at the server", JSON.stringify(left[0], (k, v) => (typeof v === "bigint" ? Number(v) : v)));
  ck((await db.mediaAsset.count({ where: { isPrivate: true, url: { startsWith: "https://imagedelivery" } } })) === 0, "private documents stayed private", "");
  // customer pages: images come from Cloudflare and actually render
  const c = await b.newContext({ ...devices["iPhone 13"], baseURL: BASE }); await serveFromUs(c); const p = await c.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  for (const path of ["/restaurants", "/explore", "/r/burger-house", "/"]) {
    await p.goto(path, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
    const imgs = await p.$$eval("img", (els) => els.map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0, vis: i.getBoundingClientRect().height > 0 })).filter((i) => i.vis && /imagedelivery|\/media\/i\//.test(i.src)));
    const cf = imgs.filter((i) => i.src.includes("imagedelivery.net")); const local = imgs.filter((i) => i.src.includes("/media/i/")); const broken = imgs.filter((i) => !i.ok);
    ck(cf.length > 0 && local.length === 0 && broken.length === 0, `${path}: ${cf.length} photos from Cloudflare, ${local.length} from the server, ${broken.length} broken`, JSON.stringify(broken.slice(0, 2)));
  }
  ck(!errs.length, "no page errors", errs.join(" | "));
  // a new photo uploaded now goes straight to Cloudflare
  const o = await b.newContext({ baseURL: BASE }); const op = await o.newPage();
  await op.goto("/login"); await op.fill("#email", "owner@burgerhouse.demo"); await op.fill("#password", "demo1234");
  await Promise.all([op.waitForURL((u) => !u.pathname.startsWith("/login")), op.getByRole("button", { name: "Log in" }).click()]);
  const buf = await require("sharp")({ create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
  const up = await op.request.put("/api/uploads?kind=image", { data: buf, headers: { "content-type": "image/png", "x-filename": "new.png" } });
  const newest = await db.mediaAsset.findFirst({ orderBy: { createdAt: "desc" } });
  ck(up.ok() && newest.url === `https://imagedelivery.net/HASH1/${newest.id}/orig`, "a new upload goes straight to Cloudflare", newest.url);
  ck(!!(await db.mediaBlob.findFirst({ where: { assetId: newest.id } })), "and keeps its backup copy", "");
  // pressing the button again changes nothing
  await a.reload({ waitUntil: "networkidle" }); ck(!(await a.getByTestId("move-photos").count()), "nothing left to move: the button is gone", "");
  await b.close(); await db.$disconnect(); process.exit(0); })().catch(async (e) => { console.error(e.message); process.exit(1); });
