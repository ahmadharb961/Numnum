/* eslint-disable no-console */
// Seeds platform defaults (categories, first admin). With SEED_DEMO=true it also
// creates demo restaurants, menus, generated photos and videos, orders that flow
// through the real order/commission/billing services, reviews and invoices.
// Demo content is for development and demo environments only.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/passwords";
import { processImage, storeRawVideo, processVideoAsset } from "../src/server/media";
import { attachImage } from "../src/server/menu";
import { createOrder, restaurantOrderAction, customerCancelOrder } from "../src/server/orders";
import { generateInvoice, submitPayment } from "../src/server/billing";
import { submitItemReview, submitRestaurantReview } from "../src/server/reviews";
import { updateSetting, DEFAULT_SETTINGS } from "../src/server/settings";
import { previousPeriod } from "../src/lib/utils";

const CATEGORIES = [
  ["burgers", "Burgers", "برغر", "🍔"],
  ["pizza", "Pizza", "بيتزا", "🍕"],
  ["lebanese", "Lebanese", "لبناني", "🇱🇧"],
  ["shawarma", "Shawarma", "شاورما", "🌯"],
  ["sandwiches", "Sandwiches", "سندويشات", "🥪"],
  ["sushi", "Sushi", "سوشي", "🍣"],
  ["pasta", "Pasta", "باستا", "🍝"],
  ["chicken", "Chicken", "دجاج", "🍗"],
  ["healthy", "Healthy Food", "أكل صحي", "🥗"],
  ["desserts", "Desserts", "حلويات", "🍰"],
  ["breakfast", "Breakfast", "فطور", "🍳"],
  ["coffee", "Coffee", "قهوة", "☕"],
  ["drinks", "Drinks", "مشروبات", "🥤"],
] as const;

async function seedBase() {
  for (const [i, [slug, name, nameAr, emoji]] of CATEGORIES.entries()) {
    await prisma.foodCategory.upsert({ where: { slug }, create: { slug, name, nameAr, emoji, sortOrder: i }, update: {} });
  }
  const email = process.env.ADMIN_EMAIL || (process.env.SEED_DEMO === "true" ? "admin@numnum.app" : "");
  const password = process.env.ADMIN_PASSWORD || (process.env.SEED_DEMO === "true" ? "admin1234" : "");
  if (!email || !password) {
    console.log("ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin creation");
    return null;
  }
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Platform Admin", passwordHash: await hashPassword(password), roles: { create: [{ role: "ADMIN" }] } },
    update: {},
  });
  await prisma.userRole.upsert({ where: { userId_role: { userId: admin.id, role: "ADMIN" } }, create: { userId: admin.id, role: "ADMIN" }, update: {} });
  console.log(`Admin: ${email}`);
  return admin;
}

// ───── demo media generation ─────

const PALETTES = [
  ["#ff7438", "#7f2111"],
  ["#f6b73c", "#a14a0a"],
  ["#62b36f", "#1d5a2c"],
  ["#e8505b", "#6e1423"],
  ["#c08552", "#4b2e19"],
  ["#5aa9e6", "#1b3a5c"],
];

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

function demoVideo(label: string, idx: number, dir: string) {
  const [a, b] = PALETTES[idx % PALETTES.length];
  const file = path.join(dir, `reel-${idx}.mp4`);
  const text = label.replace(/[':\\]/g, "");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", `gradients=s=720x1280:c0=${a.replace("#", "0x")}:c1=${b.replace("#", "0x")}:speed=0.03:d=6:r=30`,
    "-f", "lavfi", "-i", "sine=frequency=220:duration=6",
    "-vf", `drawtext=text='${text}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=h*0.42+sin(t*2)*30:font='Inter':borderw=3:bordercolor=black@0.25,drawtext=text='numnum demo reel':fontcolor=white@0.8:fontsize=32:x=(w-text_w)/2:y=h*0.52`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file,
  ]);
  return file;
}

// ───── demo data ─────

type Opt = [string, number] | [string, number, true];
type Group = { name: string; type: "SINGLE" | "MULTIPLE" | "TEXT"; required?: boolean; max?: number; options?: Opt[] };
type Item = { sku: string; name: string; cat: string; food: string; price: number; desc: string; ingredients: string; allergens?: string; diet?: string[]; emoji: string; groups?: string[]; prep?: number };
type Demo = { slug: string; name: string; business: string; cuisine: string; area: string; city: string; desc: string; currency?: string; lat: number; lng: number; owner: string; verified?: boolean; fee?: number | null; areas?: [string, number | null][]; groups: Record<string, Group>; items: Item[]; reels: string[] };

const HOURS = { mon: [{ open: "11:00", close: "23:30" }], tue: [{ open: "11:00", close: "23:30" }], wed: [{ open: "11:00", close: "23:30" }], thu: [{ open: "11:00", close: "23:30" }], fri: [{ open: "11:00", close: "01:00" }], sat: [{ open: "11:00", close: "01:00" }], sun: [{ open: "12:00", close: "23:00" }] };

const DEMOS: Demo[] = [
  {
    slug: "burger-house", name: "Burger House", business: "Burger House SARL", cuisine: "Burgers, American", area: "Hamra", city: "Beirut", owner: "owner@burgerhouse.demo", verified: true, fee: null,
    desc: "Smashed-to-order burgers on toasted brioche. Fresh beef ground daily, hand-cut fries.", lat: 33.8959, lng: 35.4787,
    areas: [["Hamra", 1.5], ["Ras Beirut", 2], ["Verdun", 2.5], ["Achrafieh", 3]],
    groups: {
      cheese: { name: "Cheese", type: "SINGLE", required: true, options: [["Cheddar", 0, true], ["American", 0], ["Swiss", 50]] },
      extras: { name: "Extra toppings", type: "MULTIPLE", max: 4, options: [["Extra cheese", 100], ["Bacon", 150], ["Fried egg", 100], ["Caramelized onions", 75]] },
      remove: { name: "Remove ingredients", type: "MULTIPLE", options: [["No pickles", 0], ["No onions", 0], ["No sauce", 0]] },
      sauce: { name: "Sauce", type: "SINGLE", required: true, options: [["House sauce", 0, true], ["BBQ sauce", 0], ["Spicy mayo", 0]] },
      side: { name: "Add a side", type: "SINGLE", options: [["Add fries", 250], ["Add onion rings", 300]] },
      cook: { name: "Cooking preference", type: "SINGLE", required: true, options: [["Medium", 0, true], ["Medium well", 0], ["Well done", 0]] },
      notes: { name: "Special instructions", type: "TEXT" },
    },
    items: [
      { sku: "BRG001", name: "Double Smash Burger", cat: "Burgers", food: "burgers", price: 750, emoji: "🍔", desc: "Two smashed beef patties, melted cheese, house sauce, pickles on a toasted brioche bun.", ingredients: "Beef, cheese, brioche bun, pickles, onion, house sauce", allergens: "Gluten, Dairy, Egg", groups: ["cheese", "extras", "remove", "sauce", "side", "cook", "notes"], prep: 12 },
      { sku: "BRG002", name: "Crispy Chicken Burger", cat: "Burgers", food: "chicken", price: 675, emoji: "🍗", desc: "Buttermilk fried chicken thigh, slaw and spicy mayo.", ingredients: "Chicken thigh, flour, buttermilk, cabbage, mayo, brioche bun", allergens: "Gluten, Egg, Dairy", groups: ["extras", "remove", "side", "notes"], prep: 12 },
      { sku: "BRG003", name: "Mushroom Swiss", cat: "Burgers", food: "burgers", price: 825, emoji: "🍄", desc: "Single patty, sautéed mushrooms, Swiss cheese, truffle mayo.", ingredients: "Beef, mushrooms, Swiss cheese, truffle mayo, brioche bun", allergens: "Gluten, Dairy, Egg", groups: ["extras", "remove", "side", "cook", "notes"], prep: 14 },
      { sku: "SD001", name: "French Fries", cat: "Sides", food: "burgers", price: 300, emoji: "🍟", desc: "Hand-cut skin-on fries, sea salt.", ingredients: "Potato, sunflower oil, salt", diet: ["Vegan"], prep: 6 },
      { sku: "SD002", name: "Loaded Fries", cat: "Sides", food: "burgers", price: 500, emoji: "🧀", desc: "Fries, cheese sauce, beef bacon bits, jalapeños.", ingredients: "Potato, cheese sauce, beef bacon, jalapeño", allergens: "Dairy", prep: 8 },
      { sku: "DR001", name: "Fresh Lemonade", cat: "Drinks", food: "drinks", price: 250, emoji: "🍋", desc: "Squeezed daily with mint.", ingredients: "Lemon, sugar, mint, water", diet: ["Vegan"] },
    ],
    reels: ["BRG001", "BRG002", "SD002"],
  },
  {
    slug: "manousheh-corner", name: "Manousheh Corner", business: "Manousheh Corner", cuisine: "Lebanese bakery", area: "Achrafieh", city: "Beirut", owner: "owner@manousheh.demo", verified: true, fee: 100,
    desc: "Stone-oven manakish baked to order since the morning call to prayer.", lat: 33.8869, lng: 35.5197,
    groups: { veg: { name: "Add vegetables", type: "MULTIPLE", options: [["Tomato", 0], ["Cucumber", 0], ["Mint", 0], ["Olives", 25]] }, cheese: { name: "Add cheese", type: "SINGLE", options: [["Akkawi", 75], ["Halloumi", 100]] } },
    items: [
      { sku: "MN001", name: "Zaatar Manousheh", cat: "Manakish", food: "lebanese", price: 150, emoji: "🫓", desc: "Thyme, sumac, sesame and olive oil on fresh dough.", ingredients: "Flour, zaatar, sesame, sumac, olive oil", allergens: "Gluten, Sesame", diet: ["Vegan"], groups: ["veg", "cheese"], prep: 7 },
      { sku: "MN002", name: "Cheese Manousheh", cat: "Manakish", food: "lebanese", price: 250, emoji: "🧀", desc: "Akkawi and mozzarella blend, bubbling hot.", ingredients: "Flour, akkawi, mozzarella", allergens: "Gluten, Dairy", groups: ["veg"], prep: 8 },
      { sku: "MN003", name: "Lahm Bi Ajeen", cat: "Manakish", food: "lebanese", price: 300, emoji: "🥙", desc: "Spiced minced meat, tomato and onion on thin dough.", ingredients: "Flour, minced beef, tomato, onion, spices", allergens: "Gluten", prep: 9 },
      { sku: "MN004", name: "Kishk Manousheh", cat: "Manakish", food: "breakfast", price: 250, emoji: "🌾", desc: "Fermented bulgur and yogurt with onion and tomato.", ingredients: "Flour, kishk, onion, tomato, sesame", allergens: "Gluten, Dairy, Sesame", prep: 8 },
    ],
    reels: ["MN001", "MN002"],
  },
  {
    slug: "shawarma-station", name: "Shawarma Station", business: "Shawarma Station SAL", cuisine: "Shawarma, Lebanese", area: "Mar Mikhael", city: "Beirut", owner: "owner@shawarma.demo", fee: 200,
    desc: "Charcoal-kissed shawarma, whipped garlic toum and pickles made in-house.", lat: 33.8975, lng: 35.5265,
    groups: { size: { name: "Size", type: "SINGLE", required: true, options: [["Regular", 0, true], ["Large", 150]] }, extra: { name: "Extras", type: "MULTIPLE", max: 3, options: [["Extra toum", 50], ["Extra pickles", 0], ["Add fries inside", 50], ["No meat (veg only)", -100]] } },
    items: [
      { sku: "SH001", name: "Chicken Shawarma Sandwich", cat: "Sandwiches", food: "shawarma", price: 450, emoji: "🌯", desc: "Marinated chicken, toum, pickles, fries in saj bread.", ingredients: "Chicken, garlic, saj bread, pickles, potato", allergens: "Gluten", groups: ["size", "extra"], prep: 6 },
      { sku: "SH002", name: "Beef Shawarma Sandwich", cat: "Sandwiches", food: "shawarma", price: 500, emoji: "🥩", desc: "Beef shawarma, tarator, parsley, onion, tomato.", ingredients: "Beef, tahini, parsley, onion, tomato, bread", allergens: "Gluten, Sesame", groups: ["size", "extra"], prep: 6 },
      { sku: "SH003", name: "Chicken Shawarma Platter", cat: "Platters", food: "chicken", price: 900, emoji: "🍽️", desc: "Generous shawarma, fries, toum, pickles and bread.", ingredients: "Chicken, potato, garlic, pickles, bread", allergens: "Gluten", prep: 10 },
    ],
    reels: ["SH001", "SH003"],
  },
  {
    slug: "pizza-forno", name: "Pizza Forno", business: "Forno Group", cuisine: "Pizza, Italian", area: "Jounieh", city: "Jounieh", owner: "owner@forno.demo", fee: 250,
    desc: "48-hour fermented dough, San Marzano tomatoes, wood-fired at 450°C.", lat: 33.9808, lng: 35.6178,
    groups: { size: { name: "Size", type: "SINGLE", required: true, options: [["Medium", 0, true], ["Large", 300]] }, crust: { name: "Crust", type: "SINGLE", required: true, options: [["Classic", 0, true], ["Thin", 0]] }, top: { name: "Toppings", type: "MULTIPLE", max: 5, options: [["Extra cheese", 150], ["Mushrooms", 100], ["Olives", 75], ["Rocket", 75], ["Spicy salami", 200]] } },
    items: [
      { sku: "PZ001", name: "Margherita", cat: "Pizza", food: "pizza", price: 900, emoji: "🍕", desc: "Tomato, fior di latte, basil, olive oil.", ingredients: "Flour, tomato, mozzarella, basil, olive oil", allergens: "Gluten, Dairy", diet: ["Vegetarian"], groups: ["size", "crust", "top"], prep: 15 },
      { sku: "PZ002", name: "Pepperoni", cat: "Pizza", food: "pizza", price: 1100, emoji: "🍕", desc: "Spicy beef pepperoni, mozzarella, hot honey.", ingredients: "Flour, tomato, mozzarella, beef pepperoni, honey", allergens: "Gluten, Dairy", groups: ["size", "crust", "top"], prep: 15 },
      { sku: "PS001", name: "Truffle Pasta", cat: "Pasta", food: "pasta", price: 1250, emoji: "🍝", desc: "Tagliatelle, mushroom cream, black truffle paste, parmesan.", ingredients: "Pasta, cream, mushrooms, truffle, parmesan", allergens: "Gluten, Dairy, Egg", prep: 14 },
    ],
    reels: ["PZ001", "PZ002"],
  },
  {
    slug: "bean-bar", name: "Bean Bar", business: "Bean Bar Coffee", cuisine: "Coffee, Bakery", area: "Gemmayzeh", city: "Beirut", owner: "owner@beanbar.demo", fee: 100,
    desc: "Specialty coffee roasted in Beirut, plus fresh pastries every morning.", lat: 33.8946, lng: 35.5165,
    groups: { size: { name: "Size", type: "SINGLE", required: true, options: [["Small", 0, true], ["Medium", 50], ["Large", 100]] }, milk: { name: "Milk type", type: "SINGLE", required: true, options: [["Full fat", 0, true], ["Skimmed", 0], ["Oat", 50], ["Almond", 50]] }, sugar: { name: "Sugar", type: "SINGLE", options: [["No sugar", 0], ["1 sugar", 0], ["2 sugars", 0]] }, shot: { name: "Extras", type: "MULTIPLE", options: [["Extra shot", 75], ["Vanilla syrup", 50], ["Caramel syrup", 50]] } },
    items: [
      { sku: "CF001", name: "Latte", cat: "Coffee", food: "coffee", price: 350, emoji: "☕", desc: "Double espresso and silky steamed milk.", ingredients: "Espresso, milk", allergens: "Dairy (unless plant milk)", groups: ["size", "milk", "sugar", "shot"], prep: 4 },
      { sku: "CF002", name: "Iced Spanish Latte", cat: "Coffee", food: "coffee", price: 450, emoji: "🧊", desc: "Espresso, condensed milk, milk over ice.", ingredients: "Espresso, condensed milk, milk, ice", allergens: "Dairy", groups: ["size", "milk", "shot"], prep: 4 },
      { sku: "BK001", name: "Butter Croissant", cat: "Bakery", food: "breakfast", price: 250, emoji: "🥐", desc: "Laminated with French butter, baked every morning.", ingredients: "Flour, butter, milk, sugar, yeast, egg", allergens: "Gluten, Dairy, Egg", prep: 2 },
    ],
    reels: ["CF002"],
  },
  {
    slug: "sweet-ashta", name: "Sweet Ashta", business: "Sweet Ashta", cuisine: "Lebanese desserts", area: "Tripoli", city: "Tripoli", owner: "owner@ashta.demo", currency: "LBP", fee: 150000,
    desc: "Traditional Tripoli sweets — warm knefeh and fresh ashta.", lat: 34.4367, lng: 35.8497,
    groups: { bread: { name: "Serve with", type: "SINGLE", options: [["Kaak bread", 0, true], ["Plate only", 0]] } },
    items: [
      { sku: "DS001", name: "Knefeh Bi Jibn", cat: "Sweets", food: "desserts", price: 350000, emoji: "🧁", desc: "Warm semolina and cheese, orange-blossom syrup, sesame kaak.", ingredients: "Semolina, akkawi cheese, sugar syrup, sesame bread", allergens: "Gluten, Dairy, Sesame", groups: ["bread"], prep: 5 },
      { sku: "DS002", name: "Ashta Bi Asal", cat: "Sweets", food: "desserts", price: 400000, emoji: "🍯", desc: "Clotted cream, honey and pistachio.", ingredients: "Milk, cream, honey, pistachio", allergens: "Dairy, Nuts" },
    ],
    reels: ["DS001"],
  },
];

async function seedDemo(adminId: string) {
  if (await prisma.restaurant.findUnique({ where: { slug: "burger-house" } })) {
    console.log("Demo data already present — skipping");
    return;
  }
  await updateSetting("whish", { recipientName: "numnum Demo Account", whishNumber: "70 000 000", accountId: "NUMNUM-DEMO", instructions: DEFAULT_SETTINGS.whish.instructions }, adminId);

  const tmp = mkdtempSync(path.join(os.tmpdir(), "nnseed-"));
  // Demo reels are generated with ffmpeg. Hosts without it (e.g. Hostinger) get
  // demo restaurants and menus without reels; upload real videos from the dashboard.
  const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
  if (!hasFfmpeg) console.log("ffmpeg not found — demo restaurants will have no reels");
  const pw = await hashPassword("demo1234");
  const foodCats = Object.fromEntries((await prisma.foodCategory.findMany()).map((c) => [c.slug, c.id]));
  let imgIdx = 0;
  const created: { r: Awaited<ReturnType<typeof prisma.restaurant.create>>; owner: { id: string }; items: Record<string, string> }[] = [];

  for (const d of DEMOS) {
    const owner = await prisma.user.create({ data: { email: d.owner, name: `${d.name} Owner`, passwordHash: pw, roles: { create: { role: "RESTAURANT" } } } });
    const currency = d.currency ?? "USD";
    const r = await prisma.restaurant.create({
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
    const logo = await processImage(await foodImage("", d.items[0].emoji, imgIdx), { restaurantId: r.id, originalName: "logo.jpg", maxSize: 400 });
    const cover = await processImage(await foodImage(d.name, d.items[1]?.emoji ?? d.items[0].emoji, imgIdx + 1), { restaurantId: r.id, originalName: "cover.jpg" });
    await prisma.restaurant.update({ where: { id: r.id }, data: { logoUrl: logo.url, coverUrl: cover.url } });

    const groupIds: Record<string, string> = {};
    for (const [key, g] of Object.entries(d.groups)) {
      const opts = g.options ?? [];
      const created = await prisma.customizationGroup.create({
        data: { restaurantId: r.id, name: g.name, type: g.type, required: !!g.required, minSelect: g.required ? 1 : 0, maxSelect: g.type === "SINGLE" ? 1 : g.max ?? 0, options: { create: opts.map((o, i) => ({ name: o[0], priceDeltaCents: currency === "LBP" ? o[1] * 895 : o[1], isDefault: !!o[2], sortOrder: i })) } },
      });
      groupIds[key] = created.id;
    }
    const cats: Record<string, string> = {};
    const items: Record<string, string> = {};
    for (const [i, it] of d.items.entries()) {
      if (!cats[it.cat]) cats[it.cat] = (await prisma.menuCategory.create({ data: { restaurantId: r.id, name: it.cat, sortOrder: Object.keys(cats).length } })).id;
      const m = await prisma.menuItem.create({
        data: { restaurantId: r.id, sku: it.sku, name: it.name, description: it.desc, ingredients: it.ingredients, allergens: it.allergens, dietaryLabels: it.diet ?? [], priceCents: it.price, currency, menuCategoryId: cats[it.cat], foodCategoryId: foodCats[it.food], prepTimeMinutes: it.prep, sortOrder: i },
      });
      items[it.sku] = m.id;
      for (const [gi, gk] of (it.groups ?? []).entries()) await prisma.menuItemCustomizationGroup.create({ data: { menuItemId: m.id, groupId: groupIds[gk], sortOrder: gi } });
      const img = await processImage(await foodImage(it.name, it.emoji, imgIdx++), { restaurantId: r.id, originalName: `${it.sku}.jpg` });
      await attachImage(r.id, m.id, img.id);
    }
    for (const [vi, sku] of (hasFfmpeg ? d.reels : []).entries()) {
      const it = d.items.find((x) => x.sku === sku)!;
      const raw = demoVideo(it.name, imgIdx + vi, tmp);
      const asset = await storeRawVideo(raw, { restaurantId: r.id, originalName: `${sku}.mp4` });
      const out = await processVideoAsset(asset.id);
      const publishedAt = new Date(Date.now() - Math.random() * 10 * 86400_000);
      await prisma.reel.create({
        data: { restaurantId: r.id, menuItemId: items[sku], videoAssetId: asset.id, videoUrl: out.videoUrl, posterUrl: out.posterUrl, durationSec: out.durationSec, caption: vi === 0 ? `${it.name} — made fresh, order in one tap 🔥` : null, status: "READY", visibility: "PUBLISHED", publishedAt, featured: d.slug === "burger-house" && vi === 0 },
      });
    }
    created.push({ r, owner, items });
    console.log(`Restaurant: ${d.name} (${d.owner} / demo1234)`);
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
  // Opening hours are set after the demo orders so seeding works at any time of day.
  const ALWAYS = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, [{ open: "00:00", close: "00:00" }]]));
  for (const c of created) await prisma.restaurant.update({ where: { id: c.r.id }, data: { openingHours: ["burger-house", "shawarma-station", "bean-bar"].includes(c.r.slug) ? ALWAYS : HOURS } });

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
  await submitRestaurantReview(cu, { restaurantId: burger.r.id, rating: 5, foodQuality: 5, service: 4, value: 5, delivery: 4, body: "Quick confirmation on WhatsApp and friendly delivery.", orderReference: orders[0].reference });
  const reviewers = ["Karim", "Maya", "Jad", "Lea"];
  for (const [i, n] of reviewers.entries()) {
    const u = await prisma.user.create({ data: { email: `${n.toLowerCase()}@numnum.demo`, name: `${n} Demo`, passwordHash: pw, roles: { create: { role: "CUSTOMER" } } } });
    const target = created[i % created.length];
    const first = Object.values(target.items)[0];
    await submitItemReview({ id: u.id, email: u.email, name: u.name, phone: null, roles: ["CUSTOMER"] }, { menuItemId: first, rating: 4 + (i % 2), body: ["So good, ordering again tomorrow.", "Generous portion for the price.", "Exactly like the reel 😍", "Fresh and tasty."][i] });
  }

  rmSync(tmp, { recursive: true, force: true });
  console.log("Customer: customer@numnum.demo / demo1234");
}

async function main() {
  const admin = await seedBase();
  if (process.env.SEED_DEMO === "true" && admin) await seedDemo(admin.id);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
