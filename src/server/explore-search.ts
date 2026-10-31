import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { topUpSearchText } from "./search-text";
import { parseQuery, scoreFields, words, type Field, type Query } from "@/lib/search-match";
import { quoteDelivery, type LatLng } from "@/lib/geo";
import type { SearchParams } from "./search";

// Explore search, built to stay fast with tens of thousands of dishes, restaurants and reels:
// matching runs in Postgres against pre-normalized, trigram-indexed text (searchName /
// searchText, see search-text.ts), only the visible page is returned, and counts are capped.

export const PAGE = 24;
const CANDIDATES = 192; // best matches re-ranked precisely (8 pages)
export const COUNT_CAP = 1000;

type Tab = "dishes" | "reels" | "restaurants";

export type ExploreDish = { id: string; name: string; description: string | null; priceCents: number; currency: string; ratingAvg: number; ratingCount: number; available: boolean; image: { url: string; thumbUrl: string | null } | null; restaurant: { slug: string; displayName: string; verificationStatus: string } };
export type ExploreRestaurant = { id: string; slug: string; displayName: string; logoUrl: string | null; coverUrl: string | null; cuisine: string | null; area: string | null; city: string | null; verificationStatus: string; ratingAvg: number; ratingCount: number; deliveryEnabled: boolean; pickupEnabled: boolean; openingHours: unknown; avgPrepMinutes: number | null; delivery: { km: number | null; deliverable: boolean; feeCents: number | null } | null };
export type ExploreReel = { id: string; posterUrl: string | null; views: number; label: string };
export type ExploreResult = {
  q: string;
  type: Tab;
  page: number;
  corrected: boolean;
  counts: Record<Tab, number>;
  hasMore: boolean;
  dishes?: ExploreDish[];
  restaurants?: ExploreRestaurant[];
  reels?: ExploreReel[];
};

// ---- SQL building -------------------------------------------------------------------------

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** One typed word (any of its spellings) inside a normalized column; the trigram index serves 3+ letters. */
function tokenSql(col: Prisma.Sql, v: string) {
  return v.length >= 3 ? Prisma.sql`${col} LIKE ${`%${v}%`}` : Prisma.sql`(' ' || ${col}) LIKE ${`% ${v}%`}`;
}

/** Every typed word must match (each through any of its spellings). */
function matchSql(col: string, query: Query, _fuzzy?: boolean) {
  const c = Prisma.raw(col);
  return Prisma.join(
    query.map((spellings) => Prisma.sql`(${Prisma.join(spellings.map((v) => tokenSql(c, v)), " OR ")})`),
    " AND ",
  );
}

/**
 * Spelling correction against the dictionary of words on the menus (search_words, trigram
 * index): "shawrma" also searches "shawarma". Returns null when nothing close was found.
 */
async function correct(query: Query): Promise<Query | null> {
  let found = false;
  const out = await Promise.all(
    query.map(async (spellings) => {
      const t = spellings[0];
      if (t.length < 4) return spellings;
      const rows = await prisma.$queryRaw<{ word: string; sim: number }[]>`
        SELECT "word", similarity("word", ${t}) AS "sim" FROM "search_words" WHERE "word" % ${t} ORDER BY "sim" DESC, "n" DESC LIMIT 3`;
      // Only the closest spelling (and near-ties), so "chiken" means chicken, not "kitchen".
      const best = rows[0]?.sim ?? 0;
      const close = rows.filter((r) => r.sim >= Math.max(0.4, best * 0.92)).map((r) => r.word);
      if (!close.length) return spellings;
      found = true;
      return [...new Set([...spellings, ...close])];
    }),
  );
  return found ? out : null;
}

function restaurantFilters(p: SearchParams) {
  const f: Prisma.Sql[] = [Prisma.sql`r."status" = 'ACTIVE'`];
  if (p.cuisine) f.push(Prisma.sql`r."cuisine" ILIKE ${`%${likeEscape(p.cuisine)}%`}`);
  if (p.area) f.push(Prisma.sql`(r."area" ILIKE ${`%${likeEscape(p.area)}%`} OR r."city" ILIKE ${`%${likeEscape(p.area)}%`})`);
  if (p.nearIds) f.push(p.nearIds.length ? Prisma.sql`r."id" = ANY(${p.nearIds}::text[])` : Prisma.sql`false`);
  if (p.delivery) f.push(Prisma.sql`r."deliveryEnabled" = true`);
  if (p.pickup) f.push(Prisma.sql`r."pickupEnabled" = true`);
  if (p.verified) f.push(Prisma.sql`r."verificationStatus" = 'APPROVED'`);
  if (p.minRating) f.push(Prisma.sql`r."ratingAvg" >= ${p.minRating}`);
  return f;
}

const categoryId = (slug: string) => Prisma.sql`(SELECT "id" FROM "food_categories" WHERE "slug" = ${slug})`;

function dishWhere(p: SearchParams, query: Query, fuzzy: boolean) {
  const f = [Prisma.sql`m."archived" = false`, ...restaurantFilters(p)];
  if (p.category) f.push(Prisma.sql`m."foodCategoryId" = ${categoryId(p.category)}`);
  if (p.minPrice !== undefined) f.push(Prisma.sql`m."priceCents" >= ${Math.round(p.minPrice * 100)}`);
  if (p.maxPrice !== undefined) f.push(Prisma.sql`m."priceCents" <= ${Math.round(p.maxPrice * 100)}`);
  if (p.available) f.push(Prisma.sql`m."available" = true`);
  if (p.minItemRating) f.push(Prisma.sql`m."ratingAvg" >= ${p.minItemRating}`);
  if (query.length) f.push(matchSql('m."searchText"', query, fuzzy));
  return Prisma.join(f, " AND ");
}

function restaurantWhere(p: SearchParams, query: Query, fuzzy: boolean) {
  const f = restaurantFilters(p);
  if (p.category) f.push(Prisma.sql`EXISTS (SELECT 1 FROM "menu_items" m WHERE m."restaurantId" = r."id" AND m."archived" = false AND m."foodCategoryId" = ${categoryId(p.category)})`);
  if (query.length) f.push(matchSql('r."searchText"', query, fuzzy));
  return Prisma.join(f, " AND ");
}

const reelWhere = (p: SearchParams, query: Query, fuzzy: boolean) => Prisma.sql`rl."visibility" = 'PUBLISHED' AND rl."status" = 'READY' AND ${dishWhere(p, query, fuzzy)}`;

const nameFirst = (col: string, query: Query, fuzzy: boolean) => (query.length ? Prisma.sql`(${matchSql(col, query, fuzzy)}) DESC,` : Prisma.empty);

// ---- queries ------------------------------------------------------------------------------

type DishRow = Omit<ExploreDish, "image" | "restaurant"> & { section: string | null; catName: string | null; catNameAr: string | null; slug: string; displayName: string; verificationStatus: string; cuisine: string | null; area: string | null; city: string | null; imgUrl: string | null; imgThumb: string | null };

function dishRows(p: SearchParams, query: Query, fuzzy: boolean, limit: number, offset: number) {
  return prisma.$queryRaw<DishRow[]>`
    SELECT d.*, img."url" AS "imgUrl", img."thumbUrl" AS "imgThumb" FROM (
      SELECT m."id", m."name", left(m."description", 200) AS "description", m."priceCents", m."currency", m."ratingAvg", m."ratingCount", m."available",
        mc."name" AS "section", fc."name" AS "catName", fc."nameAr" AS "catNameAr",
        r."slug", r."displayName", r."verificationStatus"::text AS "verificationStatus", r."cuisine", r."area", r."city"
      FROM "menu_items" m
      JOIN "restaurants" r ON r."id" = m."restaurantId"
      LEFT JOIN "menu_categories" mc ON mc."id" = m."menuCategoryId"
      LEFT JOIN "food_categories" fc ON fc."id" = m."foodCategoryId"
      WHERE ${dishWhere(p, query, fuzzy)}
      ORDER BY ${nameFirst('m."searchName"', query, fuzzy)} m."ratingCount" DESC, m."viewCount" DESC, m."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    ) d
    LEFT JOIN LATERAL (
      SELECT a."url", a."thumbUrl" FROM "menu_item_images" i JOIN "media_assets" a ON a."id" = i."assetId"
      WHERE i."menuItemId" = d."id" ORDER BY i."isMain" DESC, i."sortOrder" ASC LIMIT 1
    ) img ON true`;
}

type RestaurantRow = Omit<ExploreRestaurant, "delivery"> & { latitude: number | null; longitude: number | null; deliveryZones: unknown; description: string | null };

function restaurantRows(p: SearchParams, query: Query, fuzzy: boolean, limit: number, offset: number) {
  return prisma.$queryRaw<RestaurantRow[]>`
    SELECT r."id", r."slug", r."displayName", r."logoUrl", r."coverUrl", r."cuisine", r."area", r."city", r."verificationStatus"::text AS "verificationStatus",
      r."ratingAvg", r."ratingCount", r."deliveryEnabled", r."pickupEnabled", r."openingHours", r."avgPrepMinutes", r."latitude", r."longitude", r."deliveryZones", left(r."description", 200) AS "description"
    FROM "restaurants" r
    WHERE ${restaurantWhere(p, query, fuzzy)}
    ORDER BY ${nameFirst('r."searchName"', query, fuzzy)} r."verificationStatus" ASC, r."ratingCount" DESC, r."totalReelViews" DESC
    LIMIT ${limit} OFFSET ${offset}`;
}

function reelRows(p: SearchParams, query: Query, fuzzy: boolean, offset: number) {
  return prisma.$queryRaw<ExploreReel[]>`
    SELECT rl."id", rl."posterUrl", rl."viewCount" AS "views", m."name" AS "label"
    FROM "reels" rl
    JOIN "menu_items" m ON m."id" = rl."menuItemId"
    JOIN "restaurants" r ON r."id" = rl."restaurantId"
    WHERE ${reelWhere(p, query, fuzzy)}
    ORDER BY ${nameFirst('m."searchName"', query, fuzzy)} rl."viewCount" DESC, rl."publishedAt" DESC
    LIMIT ${PAGE} OFFSET ${offset}`;
}

/** Counts stop at COUNT_CAP (shown as "1000+") so they stay cheap on big catalogs. */
async function count(tab: Tab, p: SearchParams, query: Query, fuzzy: boolean) {
  const inner =
    tab === "dishes"
      ? Prisma.sql`SELECT 1 FROM "menu_items" m JOIN "restaurants" r ON r."id" = m."restaurantId" WHERE ${dishWhere(p, query, fuzzy)}`
      : tab === "restaurants"
        ? Prisma.sql`SELECT 1 FROM "restaurants" r WHERE ${restaurantWhere(p, query, fuzzy)}`
        : Prisma.sql`SELECT 1 FROM "reels" rl JOIN "menu_items" m ON m."id" = rl."menuItemId" JOIN "restaurants" r ON r."id" = rl."restaurantId" WHERE ${reelWhere(p, query, fuzzy)}`;
  const [row] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM (${inner} LIMIT ${COUNT_CAP + 1}) t`;
  return Math.min(row.n, COUNT_CAP + 1);
}

// ---- ranking ------------------------------------------------------------------------------

function rerank<T>(rows: T[], query: Query, fuzzy: boolean, fields: (r: T) => Field[]) {
  const scored = rows.map((r, i) => ({ r, i, s: scoreFields(query, fields(r), fuzzy) }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map((x) => x.r);
}

const dishFields = (d: DishRow): Field[] => [
  { words: words(d.name), weight: 10 },
  { words: [...words(d.catName), ...words(d.catNameAr)], weight: 6 },
  { words: words(d.section), weight: 5 },
  { words: words(d.displayName), weight: 4 },
  { words: words(d.cuisine), weight: 3 },
  { words: words(d.description), weight: 2 },
  { words: [...words(d.area), ...words(d.city)], weight: 2 },
];
const restaurantFields = (r: RestaurantRow): Field[] => [
  { words: words(r.displayName), weight: 10 },
  { words: words(r.cuisine), weight: 6 },
  { words: [...words(r.area), ...words(r.city)], weight: 3 },
  { words: words(r.description), weight: 2 },
];

const toDish = (d: DishRow): ExploreDish => ({
  id: d.id,
  name: d.name,
  description: d.description,
  priceCents: d.priceCents,
  currency: d.currency,
  ratingAvg: d.ratingAvg,
  ratingCount: d.ratingCount,
  available: d.available,
  image: d.imgUrl ? { url: d.imgUrl, thumbUrl: d.imgThumb } : null,
  restaurant: { slug: d.slug, displayName: d.displayName, verificationStatus: d.verificationStatus },
});

function toRestaurant(r: RestaurantRow, loc: LatLng | null): ExploreRestaurant {
  const { latitude, longitude, deliveryZones, description: _d, ...rest } = r;
  const q = loc ? quoteDelivery({ latitude, longitude, deliveryZones }, loc) : null;
  return { ...rest, delivery: q ? { km: q.km, deliverable: r.deliveryEnabled && q.deliverable, feeCents: q.deliverable ? q.feeCents : null } : null };
}

/** A page of one tab with best matches first, typo-tolerant ranking, and capped counts for all tabs. */
async function run(p: SearchParams, tab: Tab, page: number, query: Query, fuzzy: boolean, loc: LatLng | null) {
  const offset = (page - 1) * PAGE;
  // With a query, the top CANDIDATES rows are re-ranked precisely in memory; beyond them, database order.
  const ranked = query.length > 0 && offset + PAGE <= CANDIDATES;
  const window = ranked ? CANDIDATES : PAGE;
  const start = ranked ? 0 : offset;
  const page_ = <T,>(rows: T[], fields: (r: T) => Field[]) => (ranked ? rerank(rows, query, fuzzy, fields).slice(offset, offset + PAGE) : rows);
  // List and the three (capped) counts run in parallel: one database round trip of latency.
  const [list, dishes, reels, restaurants] = await Promise.all([
    tab === "dishes"
      ? dishRows(p, query, fuzzy, window, start).then((rows) => page_(rows, dishFields).map(toDish))
      : tab === "restaurants"
        ? restaurantRows(p, query, fuzzy, window, start).then((rows) => page_(rows, restaurantFields).map((r) => toRestaurant(r, loc)))
        : reelRows(p, query, fuzzy, offset),
    count("dishes", p, query, fuzzy),
    count("reels", p, query, fuzzy),
    count("restaurants", p, query, fuzzy),
  ]);
  const counts = { dishes, reels, restaurants };
  return { list, counts };
}

// Popular searches repeat a lot; answers are kept for 20 s per exact request.
const cache = new Map<string, { at: number; v: ExploreResult }>();

export async function exploreSearch(p: SearchParams, loc: LatLng | null): Promise<ExploreResult> {
  topUpSearchText();
  const tab: Tab = p.type ?? "dishes";
  const page = Math.min(Math.max(1, p.page ?? 1), 40);
  const q = (p.q ?? "").trim().slice(0, 80);
  const key = JSON.stringify([p, loc && [loc.lat.toFixed(2), loc.lng.toFixed(2)]]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.v;

  const query = parseQuery(q);
  let corrected = false;
  let res = await run(p, tab, page, query, false, loc);
  // Nothing spelled exactly like that: search the closest spellings on the menus instead.
  if (query.length && !res.counts.dishes && !res.counts.restaurants) {
    const fix = await correct(query);
    if (fix) {
      const again = await run(p, tab, page, fix, true, loc);
      if (again.counts.dishes || again.counts.restaurants) {
        res = again;
        corrected = true;
      }
    }
  }
  const v: ExploreResult = { q, type: tab, page, corrected, counts: res.counts, hasMore: page * PAGE < res.counts[tab], [tab]: res.list };
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), v });
  return v;
}
