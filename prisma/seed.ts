/* eslint-disable no-console */
// Seeds platform defaults (categories, first admin). With SEED_DEMO=true it also
// creates demo restaurants, menus, generated photos and videos, orders that flow
// through the real order/commission/billing services, reviews and invoices.
// Demo content is for development and demo environments only.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "../src/server/db";
import { hashPassword, verifyPassword } from "../src/server/passwords";
import { processImage, storeRawVideo, processVideoAsset } from "../src/server/media";
import { attachImage } from "../src/server/menu";
import { createOrder, restaurantOrderAction, customerCancelOrder } from "../src/server/orders";
import { generateInvoice, submitPayment } from "../src/server/billing";
import { submitItemReview, submitRestaurantReview } from "../src/server/reviews";
import { updateSetting, DEFAULT_SETTINGS } from "../src/server/settings";
import { previousPeriod } from "../src/lib/utils";
import { deleteStreamVideo, streamConfigured, streamUidOf, syncStreamReels, uploadVideoToStream } from "../src/server/stream";
import { DEMOS, PALETTES, type Demo } from "./demo-data";
import { refreshAllSearchText } from "../src/server/search-text";

const CATEGORIES = [
  ["burgers", "Burgers", "برغر", "🍔"],
  ["pizza", "Pizza", "بيتزا", "🍕"],
  ["fast-food", "Fast Food", "وجبات سريعة", "🍟"],
  ["lebanese", "Lebanese", "لبناني", "🫓"],
  ["shawarma", "Shawarma", "شاورما", "🌯"],
  ["sandwiches", "Sandwiches", "سندويشات", "🥪"],
  ["grills", "Grills", "مشاوي", "🍢"],
  ["chicken", "Chicken", "دجاج", "🍗"],
  ["manakish", "Manakish", "مناقيش", "🫓"],
  ["sushi", "Sushi", "سوشي", "🍣"],
  ["asian", "Asian", "آسيوي", "🍜"],
  ["pasta", "Pasta", "باستا", "🍝"],
  ["mexican", "Mexican", "مكسيكي", "🌮"],
  ["seafood", "Seafood", "مأكولات بحرية", "🦐"],
  ["healthy", "Healthy Food", "أكل صحي", "🥗"],
  ["breakfast", "Breakfast", "فطور", "🍳"],
  ["bakery", "Bakery", "مخبوزات", "🥐"],
  ["desserts", "Desserts", "حلويات", "🍰"],
  ["ice-cream", "Ice Cream", "بوظة", "🍦"],
  ["coffee", "Coffee", "قهوة", "☕"],
  ["drinks", "Drinks", "مشروبات", "🥤"],
] as const;

async function seedBase() {
  for (const [i, [slug, name, nameAr, emoji]] of CATEGORIES.entries()) {
    const imageUrl = `/categories/${slug}.webp`;
    await prisma.foodCategory.upsert({ where: { slug }, create: { slug, name, nameAr, emoji, imageUrl, sortOrder: i }, update: {} });
    // Categories from before the 3D images get one, and the new default order, once; admin edits stay.
    await prisma.foodCategory.updateMany({ where: { slug, imageUrl: null }, data: { imageUrl, sortOrder: i } });
  }
  // Flag emoji don't render on Windows (shows "LB"): replace the old default.
  await prisma.foodCategory.updateMany({ where: { slug: "lebanese", emoji: "🇱🇧" }, data: { emoji: "🫓" } });
  // Hosting panels sometimes keep pasted quotes or spaces around values: strip them.
  const env = (v?: string) => (v ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
  const email = (env(process.env.ADMIN_EMAIL) || (process.env.SEED_DEMO === "true" ? "admin@numnum.app" : "")).toLowerCase();
  const password = env(process.env.ADMIN_PASSWORD) || (process.env.SEED_DEMO === "true" ? "admin1234" : "");
  if (!email || !password) {
    console.log("ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin creation");
    return null;
  }
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Platform Admin", passwordHash: await hashPassword(password), roles: { create: [{ role: "ADMIN" }] } },
    update: { disabled: false },
  });
  // ADMIN_PASSWORD is the source of truth: changing it and redeploying resets the admin password.
  if (!(await verifyPassword(password, admin.passwordHash))) {
    await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(password) } });
    await prisma.session.deleteMany({ where: { userId: admin.id } });
    console.log("Admin password updated from ADMIN_PASSWORD");
  }
  await prisma.userRole.upsert({ where: { userId_role: { userId: admin.id, role: "ADMIN" } }, create: { userId: admin.id, role: "ADMIN" }, update: {} });
  console.log(`Admin: ${email}`);
  return admin;
}

// ───── demo media ─────

const DEMO_DIR = path.join(__dirname, "demo");
// Bump when the committed demo media changes, so existing demo restaurants get refreshed images.
const DEMO_MEDIA_VERSION = 3;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

async function foodImage(name: string, emoji: string, idx: number) {
  const [a, b] = PALETTES[idx % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><radialGradient id="g" cx="35%" cy="30%" r="90%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="600" cy="420" r="260" fill="#fff" opacity="0.12"/><circle cx="600" cy="420" r="200" fill="#fff" opacity="0.18"/>
    <text x="600" y="500" font-size="220" text-anchor="middle" font-family="Noto Color Emoji, DejaVu Sans, sans-serif">${emoji}</text>
    <text x="600" y="800" font-size="64" font-weight="800" text-anchor="middle" fill="#fff" font-family="Inter, DejaVu Sans, sans-serif">${esc(name)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/** Pre-rendered demo image (scripts/demo-media.ts), or a generated placeholder if missing. */
async function demoImage(rel: string, label: string, emoji: string, idx: number) {
  const file = path.join(DEMO_DIR, rel);
  return existsSync(file) ? readFileSync(file) : foodImage(label, emoji, idx);
}

/**
 * Adds a demo reel from prisma/demo/reels. With Cloudflare Stream it is uploaded there and
 * published once Stream finishes processing; otherwise it is transcoded locally with ffmpeg.
 */
async function addDemoReel(d: Demo, restaurantId: string, menuItemId: string, sku: string, vi: number, tmp: string, replace?: { id: string; storageKey: string }) {
  const file = path.join(DEMO_DIR, "reels", `${d.slug}-${sku}.mp4`);
  if (!existsSync(file)) return false;
  const it = d.items.find((x) => x.sku === sku)!;
  const caption = vi === 0 ? `${it.name} — made fresh, order in one tap 🔥` : null;
  const featured = d.slug === "burger-house" && vi === 0;
  const posterFile = file.replace(/\.mp4$/, ".jpg");
  const poster = existsSync(posterFile) ? await processImage(readFileSync(posterFile), { restaurantId, originalName: `${sku}-poster.jpg` }) : null;
  if (streamConfigured()) {
    const video = readFileSync(file);
    const uid = await uploadVideoToStream(video, `${d.slug}-${sku}.mp4`);
    const asset = await prisma.mediaAsset.create({ data: { restaurantId, kind: "VIDEO", isPrivate: false, storageKey: `stream:${uid}`, url: "", mimeType: "video/mp4", sizeBytes: video.length, originalName: `${sku}.mp4` } });
    if (replace) {
      // Keep the reel (views, likes, stats); swap in the new video once Stream has processed it.
      await prisma.reel.update({ where: { id: replace.id }, data: { videoAssetId: asset.id, posterUrl: poster?.url ?? null, status: "PROCESSING" } });
      const old = streamUidOf(replace.storageKey);
      if (old && old !== "pending") await deleteStreamVideo(old).catch(() => {});
      return true;
    }
    await prisma.reel.create({ data: { restaurantId, menuItemId, videoAssetId: asset.id, posterUrl: poster?.url ?? null, caption, featured, status: "PROCESSING", visibility: "DRAFT", autoPublish: true } });
    return true;
  }
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return false;
  const raw = path.join(tmp, `${d.slug}-${sku}.mp4`);
  copyFileSync(file, raw);
  const asset = await storeRawVideo(raw, { restaurantId, originalName: `${sku}.mp4` });
  const out = await processVideoAsset(asset.id);
  if (replace) {
    await prisma.reel.update({ where: { id: replace.id }, data: { videoAssetId: asset.id, videoUrl: out.videoUrl, posterUrl: poster?.url ?? out.posterUrl, durationSec: out.durationSec, status: "READY" } });
    return true;
  }
  const publishedAt = new Date(Date.now() - Math.random() * 10 * 86400_000);
  await prisma.reel.create({
    data: { restaurantId, menuItemId, videoAssetId: asset.id, videoUrl: out.videoUrl, posterUrl: poster?.url ?? out.posterUrl, durationSec: out.durationSec, caption, status: "READY", visibility: "PUBLISHED", publishedAt, featured },
  });
  return true;
}

async function setMainImage(restaurantId: string, menuItemId: string, image: Buffer, sku: string) {
  await prisma.menuItemImage.deleteMany({ where: { menuItemId } });
  const img = await processImage(image, { restaurantId, originalName: `${sku}.jpg` });
  await attachImage(restaurantId, menuItemId, img.id, { makeMain: true });
}

const ALWAYS_OPEN = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, [{ open: "00:00", close: "00:00" }]]));

type DemoRestaurant = { r: Awaited<ReturnType<typeof prisma.restaurant.create>>; owner: { id: string }; items: Record<string, string> };

/**
 * Creates a demo restaurant, or tops up an existing one: missing menu items and reels are
 * added, and images are replaced when the committed demo media is newer. Never touches a
 * restaurant that uses a demo slug but isn't the demo account.
 */
async function ensureDemoRestaurant(d: Demo, ri: number, opts: { pw: string; refreshMedia: boolean; tmp: string; foodCats: Record<string, string> }): Promise<DemoRestaurant | null> {
  const currency = d.currency ?? "USD";
  let r = await prisma.restaurant.findUnique({ where: { slug: d.slug } });
  if (r && r.email !== d.owner) return null;
  const owner = await prisma.user.upsert({ where: { email: d.owner }, create: { email: d.owner, name: `${d.name} Owner`, passwordHash: opts.pw, roles: { create: { role: "RESTAURANT" } } }, update: {} });
  const isNew = !r;
  if (!r) {
    r = await prisma.restaurant.create({
      data: {
        slug: d.slug, businessName: d.business, displayName: d.name, description: d.desc, cuisine: d.cuisine, area: d.area, city: d.city, address: `${d.area} main street, ${d.city}`,
        phone: "96170123456", email: d.owner, latitude: d.lat, longitude: d.lng, currency, avgPrepMinutes: 25,
        deliveryEnabled: true, pickupEnabled: true,
        deliveryZones: currency === "LBP" ? [{ maxKm: 3, feeCents: 100000 }, { maxKm: 8, feeCents: 200000 }] : [{ maxKm: 3, feeCents: d.fee ?? 150 }, { maxKm: 6, feeCents: (d.fee ?? 150) + 100 }, { maxKm: 10, feeCents: (d.fee ?? 150) + 200 }], socialLinks: { instagram: `https://instagram.com/${d.slug.replace(/-/g, "")}` },
        status: "ACTIVE", publishedAt: new Date(), orderingEnabled: true, agreementAcceptedAt: new Date(), agreementVersion: DEFAULT_SETTINGS.agreementVersion, agreementAcceptedBy: owner.id,
        verificationStatus: d.verified ? "APPROVED" : "NOT_REQUESTED",
        staff: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
  }
  if (isNew || opts.refreshMedia) {
    const logo = await processImage(await demoImage(`logos/${d.slug}.jpg`, "", d.items[0].emoji, ri), { restaurantId: r.id, originalName: "logo.jpg", maxSize: 400 });
    const cover = await processImage(await demoImage(`covers/${d.slug}.jpg`, d.name, d.items[0].emoji, ri + 1), { restaurantId: r.id, originalName: "cover.jpg" });
    r = await prisma.restaurant.update({ where: { id: r.id }, data: { logoUrl: logo.url, coverUrl: cover.url } });
  }

  const existingGroups = await prisma.customizationGroup.findMany({ where: { restaurantId: r.id } });
  const groupIds: Record<string, string> = {};
  for (const [key, g] of Object.entries(d.groups)) {
    const found = existingGroups.find((x) => x.name === g.name);
    if (found) {
      groupIds[key] = found.id;
      continue;
    }
    const opts2 = g.options ?? [];
    const created = await prisma.customizationGroup.create({
      data: { restaurantId: r.id, name: g.name, type: g.type, required: !!g.required, minSelect: g.required ? 1 : 0, maxSelect: g.type === "SINGLE" ? 1 : g.max ?? 0, options: { create: opts2.map((o, i) => ({ name: o[0], priceDeltaCents: currency === "LBP" ? o[1] * 895 : o[1], isDefault: !!o[2], sortOrder: i })) } },
    });
    groupIds[key] = created.id;
  }
  const cats = Object.fromEntries((await prisma.menuCategory.findMany({ where: { restaurantId: r.id } })).map((c) => [c.name, c.id]));
  const existingRows = await prisma.menuItem.findMany({ where: { restaurantId: r.id } });
  const existingItems = Object.fromEntries(existingRows.map((m) => [m.sku, m.id]));
  const items: Record<string, string> = {};
  for (const [i, it] of d.items.entries()) {
    const photo = () => demoImage(`photos/${d.slug}-${it.sku}.jpg`, it.name, it.emoji, ri * 10 + i);
    if (existingItems[it.sku]) {
      items[it.sku] = existingItems[it.sku];
      // Dishes move when the demo data gets a better category (e.g. fries → Fast Food).
      const food = opts.foodCats[it.food];
      if (food && existingRows.find((m) => m.sku === it.sku)?.foodCategoryId !== food) await prisma.menuItem.update({ where: { id: items[it.sku] }, data: { foodCategoryId: food } });
      if (opts.refreshMedia) await setMainImage(r.id, items[it.sku], await photo(), it.sku);
      continue;
    }
    if (!cats[it.cat]) cats[it.cat] = (await prisma.menuCategory.create({ data: { restaurantId: r.id, name: it.cat, sortOrder: Object.keys(cats).length } })).id;
    const m = await prisma.menuItem.create({
      data: { restaurantId: r.id, sku: it.sku, name: it.name, description: it.desc, ingredients: it.ingredients, allergens: it.allergens, dietaryLabels: it.diet ?? [], priceCents: it.price, currency, menuCategoryId: cats[it.cat], foodCategoryId: opts.foodCats[it.food], prepTimeMinutes: it.prep, sortOrder: i },
    });
    items[it.sku] = m.id;
    for (const [gi, gk] of (it.groups ?? []).entries()) await prisma.menuItemCustomizationGroup.create({ data: { menuItemId: m.id, groupId: groupIds[gk], sortOrder: gi } });
    await setMainImage(r.id, m.id, await photo(), it.sku);
  }

  let reels = 0;
  for (const [vi, sku] of d.reels.entries()) {
    const existing = await prisma.reel.findFirst({ where: { restaurantId: r.id, menuItemId: items[sku], status: { not: "FAILED" } }, include: { videoAsset: { select: { storageKey: true } } } });
    if (existing && !opts.refreshMedia) continue;
    if (await addDemoReel(d, r.id, items[sku], sku, vi, opts.tmp, existing ? { id: existing.id, storageKey: existing.videoAsset.storageKey } : undefined)) reels++;
  }
  console.log(`Restaurant: ${d.name} (${d.owner} / demo1234)${isNew ? "" : opts.refreshMedia ? " — images refreshed" : " — up to date"}${reels ? `, ${reels} reel(s) ${isNew ? "added" : "added/updated"}` : ""}`);
  return { r, owner, items };
}

/** Gives Cloudflare Stream a moment to finish the demo reels; the hourly cron finishes any stragglers. */
async function waitForStreamReels() {
  if (!streamConfigured()) return;
  for (let i = 0; i < 15; i++) {
    const pending = await prisma.reel.count({ where: { status: "PROCESSING", videoAsset: { storageKey: { startsWith: "stream:" } } } });
    if (!pending) return;
    await new Promise((res) => setTimeout(res, 6000));
    await syncStreamReels().catch(() => 0);
  }
  console.log("Some demo reels are still processing on Cloudflare; they go live within the hour.");
}

async function seedDemo(adminId: string) {
  const firstRun = !(await prisma.restaurant.findUnique({ where: { slug: "burger-house" } }));
  const mediaSetting = await prisma.platformSetting.findUnique({ where: { key: "demo_media_version" } });
  const refreshMedia = !firstRun && Number(mediaSetting?.value ?? 0) < DEMO_MEDIA_VERSION;
  if (firstRun) await updateSetting("whish", { recipientName: "numnum Demo Account", whishNumber: "70 000 000", accountId: "NUMNUM-DEMO", instructions: DEFAULT_SETTINGS.whish.instructions }, adminId);
  if (!streamConfigured() && spawnSync("ffmpeg", ["-version"]).status !== 0) console.log("No Cloudflare Stream or ffmpeg — demo restaurants will have no reels");

  const tmp = mkdtempSync(path.join(os.tmpdir(), "nnseed-"));
  const pw = await hashPassword("demo1234");
  const foodCats = Object.fromEntries((await prisma.foodCategory.findMany()).map((c) => [c.slug, c.id]));
  const created: DemoRestaurant[] = [];
  for (const [ri, d] of DEMOS.entries()) {
    const c = await ensureDemoRestaurant(d, ri, { pw, refreshMedia, tmp, foodCats });
    if (c) created.push(c);
  }
  // Demo restaurants are always open so they can be shown (and ordered from) at any time.
  if (!firstRun) for (const c of created) await prisma.restaurant.update({ where: { id: c.r.id }, data: { openingHours: ALWAYS_OPEN } });
  await prisma.platformSetting.upsert({ where: { key: "demo_media_version" }, create: { key: "demo_media_version", value: DEMO_MEDIA_VERSION }, update: { value: DEMO_MEDIA_VERSION } });
  if (!firstRun || created[0]?.r.slug !== "burger-house") {
    rmSync(tmp, { recursive: true, force: true });
    await waitForStreamReels();
    return;
  }

  // A customer with an account (for reviews)
  const customer = await prisma.user.create({ data: { email: "customer@numnum.demo", name: "Rana Haddad", phone: "96171111111", passwordHash: pw, roles: { create: { role: "CUSTOMER" } } } });

  // Orders through the real services: generates references, messages, commission events.
  const burger = created[0];
  const groups = await prisma.customizationGroup.findMany({ where: { restaurantId: burger.r.id }, include: { options: true } });
  const g = (name: string) => groups.find((x) => x.name === name)!;
  const opt = (gn: string, on: string) => g(gn).options.find((o) => o.name === on)!.id;
  type Plan = "complete" | "accept" | "preparing" | "out" | "placed" | "reject" | "cancel";
  const make = async (i: number, phone: string, plan: Plan, userId: string | null) => {
    const device = `seed-device-${i}-aaaaaaaaaaaa`;
    const o = await createOrder(
      {
        idempotencyKey: `seed-order-${i}-xxxxxxxxxxxxxxxx`,
        restaurantId: burger.r.id,
        fulfillment: "DELIVERY",
        changeFor: i % 3 === 0 ? "50" : null,
        items: [
          { menuItemId: burger.items.BRG001, quantity: 2, selections: { [g("Cheese").id]: [opt("Cheese", "Cheddar")], [g("Extra toppings").id]: [opt("Extra toppings", "Extra cheese")], [g("Remove ingredients").id]: [opt("Remove ingredients", "No pickles")], [g("Sauce").id]: [opt("Sauce", "BBQ sauce")], [g("Cooking preference").id]: [opt("Cooking preference", "Medium")] } },
          { menuItemId: burger.items.SD001, quantity: 1, selections: {} },
        ],
        customer: { name: i === 0 ? "Rana Haddad" : `Customer ${i}`, phone, address: "Bliss street, near AUB gate", building: "Azar bldg, 3rd floor", area: "Hamra", latitude: 33.8995, longitude: 35.4807, saveAddress: i === 0, addressLabel: "Home" },
      },
      { deviceKey: device, ipHash: null, userId },
    );
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    const act = (a: Parameters<typeof restaurantOrderAction>[3], opts = {}) => restaurantOrderAction(burger.r.id, burger.owner.id, order.id, a, opts);
    if (plan === "reject") await act("REJECT", { reason: "Too busy right now" });
    else if (plan === "cancel") await customerCancelOrder(o.reference, { userId, deviceKey: device });
    else if (plan !== "placed") {
      await act("ACCEPT", { etaMinutes: 35 });
      if (plan === "preparing" || plan === "out" || plan === "complete") await act("PREPARING");
      if (plan === "out" || plan === "complete") await act("DISPATCH");
      if (plan === "complete") await act("COMPLETE");
    }
    return order;
  };
  const plan: Plan[] = ["complete", "complete", "complete", "complete", "complete", "reject", "out", "preparing", "placed", "cancel"];
  const buyers = [customer.id];
  for (let i = 1; i < plan.length; i++) {
    const u = await prisma.user.create({ data: { email: `buyer${i}@numnum.demo`, name: `Customer ${i}`, phone: `96170${String(i).padStart(2, "0")}2345`, passwordHash: pw, roles: { create: { role: "CUSTOMER" } } } });
    buyers.push(u.id);
  }
  const orders = [];
  for (const [i, st] of plan.entries()) orders.push(await make(i, i === 0 ? "71 111 111" : `70 2${String(i).padStart(2, "0")} 345`, st, buyers[i]));
  // A month of completed orders + visits + reel views for Burger House, so Insights has data to show.
  for (let i = 0; i < 24; i++) {
    const o = await make(100 + i, `70 3${String(i).padStart(2, "0")} 111`, "complete", buyers[(i % (buyers.length - 1)) + 1]);
    const when = new Date(Date.now() - (1 + Math.floor((i * 29) / 24)) * 86400_000 + (i % 5) * 3600_000);
    await prisma.order.update({ where: { id: o.id }, data: { createdAt: when, acceptedAt: when, completedAt: new Date(when.getTime() + 40 * 60_000), reviewDismissedAt: new Date() } });
    await prisma.commissionEvent.updateMany({ where: { orderId: o.id }, data: { createdAt: when } });
  }
  const burgerReels = await prisma.reel.findMany({ where: { restaurantId: burger.r.id }, select: { id: true } });
  const visits = [], views = [];
  for (let day = 0; day < 30; day++) {
    const base = Date.now() - day * 86400_000;
    const n = 15 + ((day * 37) % 40);
    for (let j = 0; j < n; j++) visits.push({ type: "restaurant_opened", restaurantId: burger.r.id, deviceKey: `demo-visitor-${(day * 7 + j) % 120}`, createdAt: new Date(base - j * 600_000) });
    for (const [ri, r] of burgerReels.entries()) for (let j = 0; j < n * (3 - ri); j++) views.push({ reelId: r.id, viewerKey: `d:demo-${day}-${j}`, watchMs: 4000, createdAt: new Date(base - j * 300_000) });
  }
  // Reel funnel: dish opens / add-to-cart from each reel, and attribute past orders to reels.
  const funnelEvents = [];
  for (let day = 0; day < 30; day++) {
    for (const [ri, r] of burgerReels.entries()) {
      const opens = 8 - ri * 2 + (day % 4);
      for (let j = 0; j < opens; j++) funnelEvents.push({ type: "product_opened", reelId: r.id, restaurantId: burger.r.id, createdAt: new Date(Date.now() - day * 86400_000 - j * 900_000) });
      for (let j = 0; j < Math.ceil(opens / 3); j++) funnelEvents.push({ type: "add_to_cart", reelId: r.id, restaurantId: burger.r.id, createdAt: new Date(Date.now() - day * 86400_000 - j * 1200_000) });
    }
  }
  await prisma.analyticsEvent.createMany({ data: funnelEvents });
  const placedEvents = await prisma.analyticsEvent.findMany({ where: { type: "order_placed", restaurantId: burger.r.id } });
  for (const [i, e] of placedEvents.entries()) {
    const order = await prisma.order.findUnique({ where: { id: e.orderId! }, select: { createdAt: true } });
    const reel = burgerReels[i % 5 === 4 ? 2 : i % 2];
    await prisma.analyticsEvent.update({ where: { id: e.id }, data: { data: { reelIds: [reel.id] }, createdAt: order?.createdAt } });
    await prisma.reel.update({ where: { id: reel.id }, data: { orderInits: { increment: 1 } } });
  }
  await prisma.analyticsEvent.createMany({ data: visits });
  await prisma.reelView.createMany({ data: views });
  for (const r of burgerReels) await prisma.reel.update({ where: { id: r.id }, data: { viewCount: await prisma.reelView.count({ where: { reelId: r.id } }) } });
  await prisma.restaurant.update({ where: { id: burger.r.id }, data: { totalReelViews: views.length } });
  for (const c of created) await prisma.restaurant.update({ where: { id: c.r.id }, data: { openingHours: ALWAYS_OPEN } });

  // Move the first five commission events into last month and invoice them
  const last = previousPeriod();
  const lastDate = new Date(`${last}-15T12:00:00Z`);
  const firstFive = orders.slice(0, 5).map((o) => o.id);
  await prisma.commissionEvent.updateMany({ where: { orderId: { in: firstFive } }, data: { period: last, createdAt: lastDate } });
  await prisma.order.updateMany({ where: { id: { in: firstFive } }, data: { createdAt: lastDate } });
  const { invoice } = await generateInvoice(burger.r.id, last, adminId);
  if (invoice) {
    const receipt = await processImage(await foodImage("Whish receipt", "🧾", 3), { restaurantId: burger.r.id, kind: "RECEIPT", isPrivate: true, originalName: "receipt.jpg" });
    await submitPayment({ restaurantId: burger.r.id, invoiceId: invoice.id, userId: burger.owner.id, amountCents: invoice.totalDueCents, paymentDate: new Date(), whishReference: "WH-DEMO-0001", evidenceAssetIds: [receipt.id] });
    console.log(`Invoice ${invoice.number} issued for ${last} with a payment awaiting verification`);
  }

  // Reviews (linked to a fulfilled order for evidence)
  const cu = { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, roles: ["CUSTOMER" as const] };
  await submitItemReview(cu, { menuItemId: burger.items.BRG001, rating: 5, body: "Perfectly crispy edges and the house sauce is addictive. Arrived hot!", orderReference: orders[0].reference });
  await submitRestaurantReview(cu, { restaurantId: burger.r.id, rating: 5, foodQuality: 5, service: 4, value: 5, delivery: 4, body: "Order confirmed in minutes and friendly delivery.", orderReference: orders[0].reference });
  const reviewers = ["Karim", "Maya", "Jad", "Lea"];
  for (const [i, n] of reviewers.entries()) {
    const u = await prisma.user.create({ data: { email: `${n.toLowerCase()}@numnum.demo`, name: `${n} Demo`, passwordHash: pw, roles: { create: { role: "CUSTOMER" } } } });
    const target = created[i % created.length];
    const first = Object.values(target.items)[0];
    await submitItemReview({ id: u.id, email: u.email, name: u.name, phone: null, roles: ["CUSTOMER"] }, { menuItemId: first, rating: 4 + (i % 2), body: ["So good, ordering again tomorrow.", "Generous portion for the price.", "Exactly like the reel 😍", "Fresh and tasty."][i] });
  }

  rmSync(tmp, { recursive: true, force: true });
  await waitForStreamReels();
  console.log("Customer: customer@numnum.demo / demo1234");
}

async function main() {
  const admin = await seedBase();
  if (process.env.SEED_DEMO === "true" && admin) await seedDemo(admin.id);
  // Search index: build it now so search is complete right after a deploy.
  const s = await refreshAllSearchText();
  if (s.items || s.restaurants) console.log(`Search index: ${s.items} dishes, ${s.restaurants} restaurants refreshed`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
