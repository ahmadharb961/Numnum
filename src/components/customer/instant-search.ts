"use client";

import { useEffect, useState } from "react";
import { quoteDelivery, type LatLng } from "@/lib/geo";
import { parseQuery, scoreFields, words, type Field } from "@/lib/search-match";
import type { SearchIndex } from "@/server/search-index";

// The Explore search index lives in the browser: fetched once (and refreshed after a few
// minutes), then every keystroke is matched locally in a few milliseconds.

type Raw = SearchIndex;
export type IndexRestaurant = Raw["restaurants"][number];
export type IndexDish = Raw["dishes"][number];

type Prepared = {
  raw: Raw;
  restaurants: Map<string, IndexRestaurant>;
  dishFields: Map<string, Field[]>;
  restaurantFields: Map<string, Field[]>;
  categoryFields: Map<string, Field[]>;
};

let prepared: Prepared | null = null;
let loading: Promise<Prepared> | null = null;
let loadedAt = 0;
const listeners = new Set<(p: Prepared) => void>();

function prepare(raw: Raw): Prepared {
  const restaurants = new Map(raw.restaurants.map((r) => [r.id, r]));
  const cats = new Map(raw.categories.map((c) => [c.slug, c]));
  const categoryFields = new Map(raw.categories.map((c) => [c.slug, [{ words: [...words(c.name), ...words(c.nameAr), ...words(c.slug)], weight: 1 }]]));
  const dishFields = new Map<string, Field[]>();
  const byRestaurant = new Map<string, { names: string[]; cats: string[] }>();
  for (const d of raw.dishes) {
    const r = restaurants.get(d.restaurantId);
    const c = d.category ? cats.get(d.category) : null;
    dishFields.set(d.id, [
      { words: words(d.name), weight: 10 },
      { words: c ? [...words(c.name), ...words(c.nameAr)] : [], weight: 6 },
      { words: words(d.section), weight: 5 },
      { words: words(r?.displayName), weight: 4 },
      { words: words(r?.cuisine), weight: 3 },
      { words: words(d.ingredients), weight: 2 },
      { words: words(d.description), weight: 2 },
      { words: [...words(r?.area), ...words(r?.city)], weight: 2 },
    ]);
    const agg = byRestaurant.get(d.restaurantId) ?? { names: [], cats: [] };
    agg.names.push(d.name);
    if (c) agg.cats.push(c.name, c.nameAr ?? "");
    byRestaurant.set(d.restaurantId, agg);
  }
  const restaurantFields = new Map(
    raw.restaurants.map((r) => {
      const agg = byRestaurant.get(r.id);
      return [
        r.id,
        [
          { words: words(r.displayName), weight: 10 },
          { words: words(r.cuisine), weight: 6 },
          { words: [...new Set(agg?.cats.flatMap(words) ?? [])], weight: 5 },
          { words: [...new Set(agg?.names.flatMap(words) ?? [])], weight: 4 },
          { words: [...words(r.area), ...words(r.city)], weight: 3 },
          { words: words(r.description), weight: 2 },
        ],
      ];
    }),
  );
  return { raw, restaurants, dishFields, restaurantFields, categoryFields };
}

/** Starts (or reuses) the download; refreshes in the background when older than 3 minutes. */
export function loadSearchIndex(): Promise<Prepared> {
  if (prepared && Date.now() - loadedAt < 180_000) return Promise.resolve(prepared);
  loading ??= fetch("/api/search/index")
    .then((r) => {
      if (!r.ok) throw new Error("search index");
      return r.json() as Promise<Raw>;
    })
    .then((raw) => {
      prepared = prepare(raw);
      loadedAt = Date.now();
      listeners.forEach((l) => l(prepared!));
      return prepared;
    })
    .finally(() => {
      loading = null;
    });
  return prepared ? Promise.resolve(prepared) : loading;
}

export function useSearchIndex() {
  const [p, setP] = useState<Prepared | null>(prepared);
  useEffect(() => {
    listeners.add(setP);
    void loadSearchIndex().then(setP).catch(() => {});
    return () => void listeners.delete(setP);
  }, []);
  return p;
}

export type Filters = {
  category?: string | null;
  cuisine?: string | null;
  area?: string | null;
  minPrice?: number;
  maxPrice?: number;
  delivery?: boolean;
  pickup?: boolean;
  verified?: boolean;
  available?: boolean;
  minRating?: number;
  minItemRating?: number;
};

export function filtersFrom(sp: URLSearchParams): Filters {
  const n = (k: string) => {
    const v = sp.get(k);
    return v && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };
  return {
    category: sp.get("category"),
    cuisine: sp.get("cuisine"),
    area: sp.get("area"),
    minPrice: n("minPrice"),
    maxPrice: n("maxPrice"),
    delivery: sp.get("delivery") === "1",
    pickup: sp.get("pickup") === "1",
    verified: sp.get("verified") === "1",
    available: sp.get("available") === "1",
    minRating: n("minRating"),
    minItemRating: n("minItemRating"),
  };
}

const has = (v: string | null, part: string) => !!v && v.toLowerCase().includes(part.toLowerCase());

/** Results for all three tabs, best match first (or the usual order when nothing is typed). */
export function runSearch(p: Prepared, q: string, f: Filters, loc: LatLng | null) {
  // Exact spellings first; typo-tolerant matching only when that finds nothing ("did you mean").
  const exact = searchOnce(p, q, f, loc, false);
  if (!q.trim() || exact.dishes.length || exact.restaurants.length) return { ...exact, corrected: false };
  return { ...searchOnce(p, q, f, loc, true), corrected: true };
}

function searchOnce(p: Prepared, q: string, f: Filters, loc: LatLng | null, fuzzy: boolean) {
  const query = parseQuery(q);
  const okRestaurant = (r: IndexRestaurant) =>
    (!f.cuisine || has(r.cuisine, f.cuisine)) &&
    (!f.area || has(r.area, f.area) || has(r.city, f.area)) &&
    (!f.delivery || (r.deliveryEnabled && (!loc || quoteDelivery(r, loc).deliverable))) &&
    (!f.pickup || r.pickupEnabled) &&
    (!f.verified || r.verificationStatus === "APPROVED") &&
    (!f.minRating || r.ratingAvg >= f.minRating);

  const dishScore = new Map<string, number>();
  const dishes: (IndexDish & { score: number })[] = [];
  for (const d of p.raw.dishes) {
    const r = p.restaurants.get(d.restaurantId);
    if (!r || !okRestaurant(r)) continue;
    if (f.category && d.category !== f.category) continue;
    if (f.minPrice !== undefined && d.priceCents < Math.round(f.minPrice * 100)) continue;
    if (f.maxPrice !== undefined && d.priceCents > Math.round(f.maxPrice * 100)) continue;
    if (f.available && !d.available) continue;
    if (f.minItemRating && d.ratingAvg < f.minItemRating) continue;
    const score = query.length ? scoreFields(query, p.dishFields.get(d.id)!, fuzzy) : 1;
    if (!score) continue;
    dishScore.set(d.id, score);
    dishes.push({ ...d, score });
  }
  // Stable sort keeps the popularity order among equally good matches.
  if (query.length) dishes.sort((a, b) => b.score - a.score);

  const restaurants = p.raw.restaurants
    .filter(okRestaurant)
    .filter((r) => !f.category || p.raw.dishes.some((d) => d.restaurantId === r.id && d.category === f.category))
    .map((r) => ({ r, score: query.length ? scoreFields(query, p.restaurantFields.get(r.id)!, fuzzy) : 1 }))
    .filter((x) => x.score > 0);
  if (query.length) restaurants.sort((a, b) => b.score - a.score);

  const reels = p.raw.reels
    .filter((r) => dishScore.has(r.dishId))
    .map((r) => ({ ...r, score: dishScore.get(r.dishId)! }));
  if (query.length) reels.sort((a, b) => b.score - a.score || b.views - a.views);

  const categories = query.length ? p.raw.categories.filter((c) => scoreFields(query, p.categoryFields.get(c.slug)!, fuzzy) > 0) : [];
  return { dishes, restaurants: restaurants.map((x) => x.r), reels, categories };
}
