"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { parseQuery, scoreFields, words } from "@/lib/search-match";
import type { ExploreResult } from "@/server/explore-search";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/misc";
import { DishCard, ReelThumb, RestaurantCard } from "./cards";
import { rememberSearch } from "./search-controls";
import { setCounts, setQuery, setSearching, useQuery } from "./search-state";
import { useLocale, useT } from "@/i18n/client";
import { localName } from "@/i18n/core";

type Category = { slug: string; name: string; nameAr: string | null; emoji: string | null; imageUrl: string | null };
type Tab = "dishes" | "reels" | "restaurants";
const TABS: Tab[] = ["dishes", "reels", "restaurants"];
const FILTERS = ["category", "cuisine", "area", "minPrice", "maxPrice", "delivery", "pickup", "verified", "available", "minRating", "minItemRating"];

// Answers already seen (per exact request) are reused for a minute: going back, switching tabs
// or retyping a word is instant. Small and bounded.
const cache = new Map<string, { at: number; v: ExploreResult }>();
const cached = (k: string) => {
  const h = cache.get(k);
  return h && Date.now() - h.at < 60_000 ? h.v : null;
};
const remember = (k: string, v: ExploreResult) => {
  if (cache.size > 120) cache.delete(cache.keys().next().value!);
  cache.set(k, { at: Date.now(), v });
};

function requestKey(sp: URLSearchParams, q: string, type: Tab, page = 1) {
  const u = new URLSearchParams();
  if (q) u.set("q", q);
  for (const k of FILTERS) {
    const v = sp.get(k);
    if (v) u.set(k, v);
  }
  if (type !== "dishes") u.set("type", type);
  if (page > 1) u.set("page", String(page));
  return u.toString();
}

async function fetchResult(key: string, signal?: AbortSignal) {
  const hit = cached(key);
  if (hit) return hit;
  const r = await fetch(`/api/search?${key}`, { signal });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Search failed");
  const v = (await r.json()) as ExploreResult;
  remember(key, v);
  return v;
}

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export const formatCount = (n: number) => (n > 1000 ? "1000+" : String(n));

/** Explore results: one page of the active tab from /api/search, as the person types. */
export function ExploreResults({ initial, categories }: { initial: ExploreResult; categories: Category[] }) {
  const t = useT();
  const locale = useLocale();
  const sp = useSearchParams();
  const type = (sp.get("type") as Tab) || "dishes";
  const live = useQuery().trim();
  const q = useDebounced(live, 140);
  const key = requestKey(sp, q, type);

  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    remember(requestKey(sp, initial.q, initial.type), initial);
  }

  const [data, setData] = useState<ExploreResult>(() => cached(key) ?? initial);
  const [more, setMore] = useState<ExploreResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMore([]);
    setError(null);
    const hit = cached(key);
    if (hit) {
      setData(hit);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    fetchResult(key, ctl.signal)
      .then((v) => {
        setData(v);
        setLoading(false);
        // Warm the other tabs so switching is instant.
        setTimeout(() => {
          if (ctl.signal.aborted) return;
          for (const t of TABS) if (t !== type) void fetchResult(requestKey(sp, q, t), ctl.signal).catch(() => {});
        }, 250);
      })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        setError((e as Error).message);
        setLoading(false);
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // "Busy" covers typing that hasn't been sent yet, so the spinner shows from the first letter.
  const busy = loading || live !== q;
  useEffect(() => setSearching(busy), [busy]);
  useEffect(() => setCounts(data.counts), [data]);
  useEffect(() => () => setSearching(false), []);

  const matchedCategories = useMemo(() => {
    const query = parseQuery(live);
    if (!query.length) return [];
    return categories.filter((c) => scoreFields(query, [{ words: [...words(c.name), ...words(c.nameAr), ...words(c.slug)], weight: 1 }], false) > 0);
  }, [live, categories]);

  const pickCategory = (slug: string) => {
    const next = new URLSearchParams(window.location.search);
    next.set("category", slug);
    next.delete("q");
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    setQuery("");
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = data.page + more.length + 1;
      const v = await fetchResult(requestKey(sp, q, type, page));
      setMore((m) => [...m, v]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const shown = data.type === type ? data : null;
  const pages = shown ? [shown, ...more] : [];
  const last = pages[pages.length - 1];
  const dishes = pages.flatMap((p) => p.dishes ?? []);
  const reels = pages.flatMap((p) => p.reels ?? []);
  const restaurants = pages.flatMap((p) => p.restaurants ?? []);
  const total = shown?.counts[type] ?? 0;
  const onPick = () => q && rememberSearch(q);

  const empty = (what: string) =>
    shown?.q ? (
      <div className="py-6 text-center">
        <Search className="mx-auto h-10 w-10 text-ink-muted/50" />
        <h2 className="mt-3 text-lg font-extrabold">No {what} for “{shown.q}”</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">{t("Check the spelling, or try a dish, a restaurant or an area. Popular right now:")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {categories.slice(0, 8).map((c) => (
            <CategoryChip key={c.slug} c={c} onClick={() => pickCategory(c.slug)} />
          ))}
        </div>
      </div>
    ) : (
      <EmptyState icon={<Search />} title={`No ${what} found`} body={t("Try removing some filters.")} />
    );

  return (
    <div aria-busy={busy}>
      {matchedCategories.length > 0 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {matchedCategories.map((c) => (
            <CategoryChip key={c.slug} c={c} onClick={() => pickCategory(c.slug)} label={t("All {name}", { name: localName(locale, c.name, c.nameAr) })} />
          ))}
        </div>
      )}

      <div className="mb-2 flex min-h-5 items-center gap-2 text-xs font-semibold text-ink-muted">
        {busy ? (
          <span className="flex items-center gap-1.5 text-brand-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Searching…")}
          </span>
        ) : (
          shown &&
          total > 0 && (
            <span>
              {t(type === "dishes" ? (total === 1 ? "{n} dish" : "{n} dishes") : type === "reels" ? (total === 1 ? "{n} reel" : "{n} reels") : total === 1 ? "{n} restaurant" : "{n} restaurants", { n: formatCount(total) })}
            </span>
          )
        )}
      </div>
      {shown?.corrected && total > 0 && !busy && (
        <p className="mb-2 text-sm text-ink-soft">
          No exact match for “{shown.q}”. Showing <b>{t("similar results")}</b>:
        </p>
      )}
      {error && <p className="mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(error)}. {t("Check your connection and try again.")}</p>}

      {!shown ? (
        <Skeleton type={type} />
      ) : (
        <div className={cn("transition-opacity duration-150", busy && "opacity-50")} onClick={onPick}>
          {type === "dishes" &&
            (dishes.length ? (
              <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-4">
                {dishes.map((d) => (
                  <DishCard key={d.id} item={d} />
                ))}
              </div>
            ) : (
              empty("dishes")
            ))}
          {type === "reels" &&
            (reels.length ? (
              <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl lg:grid-cols-5 lg:gap-2">
                {reels.map((r) => (
                  <ReelThumb key={r.id} href={`/reel/${r.id}`} posterUrl={r.posterUrl} views={r.views} label={r.label} />
                ))}
              </div>
            ) : (
              empty("reels")
            ))}
          {type === "restaurants" &&
            (restaurants.length ? (
              <div className="grid gap-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
                {restaurants.map((r) => (
                  <RestaurantCard key={r.id} r={r} delivery={r.delivery} />
                ))}
              </div>
            ) : (
              empty("restaurants")
            ))}
        </div>
      )}

      {last?.hasMore && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="chip">
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Show more
          </button>
        </div>
      )}
    </div>
  );
}

function Skeleton({ type }: { type: Tab }) {
  if (type === "reels")
    return (
      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl lg:grid-cols-5 lg:gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="aspect-[9/16] animate-pulse bg-black/5" />
        ))}
      </div>
    );
  return (
    <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card flex gap-3 p-2.5">
          <div className="h-24 w-24 animate-pulse rounded-xl bg-black/5" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-black/5" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-black/5" />
            <div className="h-3 w-full animate-pulse rounded bg-black/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryChip({ c, onClick, label }: { c: Category; onClick: () => void; label?: string }) {
  const locale = useLocale();
  return (
    <button type="button" onClick={onClick} className="chip h-10 shrink-0 gap-2 ps-1.5">
      {c.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imageUrl} alt="" className="h-7 w-7 rounded-full" />
      ) : (
        <span>{c.emoji}</span>
      )}
      {label ?? localName(locale, c.name, c.nameAr)}
    </button>
  );
}
