"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { quoteDelivery, type LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/misc";
import { DishCard, ReelThumb, RestaurantCard } from "./cards";
import { filtersFrom, runSearch, useSearchIndex } from "./instant-search";
import { rememberSearch } from "./search-controls";
import { setCounts, setQuery, useQuery, useSearching } from "./search-state";

const STEP = 24;

/**
 * Explore results. Until the search index arrives, shows the server-rendered lists; from then on
 * every keystroke, tab, category and filter is answered in the browser instantly.
 */
export function ExploreResults({ dishes, reels, restaurants, loc }: { dishes: React.ReactNode; reels: React.ReactNode; restaurants: React.ReactNode; loc: LatLng | null }) {
  const sp = useSearchParams();
  const type = sp.get("type") ?? "dishes";
  const searching = useSearching();
  const index = useSearchIndex();
  const q = useQuery().trim();
  const filterKey = ["category", "cuisine", "area", "minPrice", "maxPrice", "delivery", "pickup", "verified", "available", "minRating", "minItemRating"].map((k) => sp.get(k) ?? "").join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const res = useMemo(() => (index ? runSearch(index, q, filtersFrom(sp), loc) : null), [index, q, filterKey, loc]);
  const [limit, setLimit] = useState(STEP);
  useEffect(() => setLimit(STEP), [q, filterKey, type]);
  useEffect(() => setCounts(res ? { dishes: res.dishes.length, reels: res.reels.length, restaurants: res.restaurants.length } : null), [res]);

  if (!index || !res)
    return (
      <div aria-busy={searching}>
        {searching && (
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </p>
        )}
        <div className={cn("transition-opacity duration-150", searching && "pointer-events-none opacity-40")}>{type === "reels" ? reels : type === "restaurants" ? restaurants : dishes}</div>
      </div>
    );

  const pickCategory = (slug: string) => {
    const next = new URLSearchParams(window.location.search);
    next.set("category", slug);
    next.delete("q");
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    setQuery("");
  };
  const remember = () => q && rememberSearch(q);
  const dishName = new Map(index.raw.dishes.map((d) => [d.id, d.name]));
  const restaurantOf = (id: string) => index.restaurants.get(id);
  const total = type === "reels" ? res.reels.length : type === "restaurants" ? res.restaurants.length : res.dishes.length;

  const more = total > limit && (
    <div className="mt-4 flex justify-center">
      <button type="button" onClick={() => setLimit((l) => l + STEP)} className="chip">
        Show more ({total - limit})
      </button>
    </div>
  );

  const empty = (what: string) =>
    q ? (
      <div className="py-6 text-center">
        <Search className="mx-auto h-10 w-10 text-ink-muted/50" />
        <h2 className="mt-3 text-lg font-extrabold">No {what} for “{q}”</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">Check the spelling, or try a dish, a restaurant or an area. Popular right now:</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {index.raw.categories.slice(0, 8).map((c) => (
            <CategoryChip key={c.slug} c={c} onClick={() => pickCategory(c.slug)} />
          ))}
        </div>
      </div>
    ) : (
      <EmptyState icon={<Search />} title={`No ${what} found`} body="Try removing some filters." />
    );

  return (
    <div>
      {res.categories.length > 0 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {res.categories.map((c) => (
            <CategoryChip key={c.slug} c={c} onClick={() => pickCategory(c.slug)} label={`All ${c.name}`} />
          ))}
        </div>
      )}

      {res.corrected && total > 0 && (
        <p className="mb-2 text-sm text-ink-soft">
          No exact match for “{q}”. Showing <b>similar results</b>:
        </p>
      )}

      {type === "dishes" &&
        (res.dishes.length ? (
          <>
            <p className="mb-2 text-xs font-semibold text-ink-muted">
              {res.dishes.length} {res.dishes.length === 1 ? "dish" : "dishes"}
            </p>
            <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-4" onClick={remember}>
              {res.dishes.slice(0, limit).map((d) => {
                const r = restaurantOf(d.restaurantId);
                return <DishCard key={d.id} item={{ ...d, restaurant: r ? { slug: r.slug, displayName: r.displayName, verificationStatus: r.verificationStatus } : undefined }} />;
              })}
            </div>
            {more}
          </>
        ) : (
          empty("dishes")
        ))}

      {type === "reels" &&
        (res.reels.length ? (
          <>
            <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl lg:grid-cols-5 lg:gap-2" onClick={remember}>
              {res.reels.slice(0, limit).map((r) => (
                <ReelThumb key={r.id} href={`/reel/${r.id}`} posterUrl={r.posterUrl} views={r.views} label={dishName.get(r.dishId)} />
              ))}
            </div>
            {more}
          </>
        ) : (
          empty("reels")
        ))}

      {type === "restaurants" &&
        (res.restaurants.length ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3" onClick={remember}>
              {res.restaurants.slice(0, limit).map((r) => {
                const qd = loc ? quoteDelivery(r, loc) : null;
                return <RestaurantCard key={r.id} r={r} delivery={qd ? { km: qd.km, deliverable: r.deliveryEnabled && qd.deliverable, feeCents: qd.deliverable ? qd.feeCents : null } : null} />;
              })}
            </div>
            {more}
          </>
        ) : (
          empty("restaurants")
        ))}
    </div>
  );
}

function CategoryChip({ c, onClick, label }: { c: { slug: string; name: string; emoji: string | null; imageUrl: string | null }; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="chip h-10 shrink-0 gap-2 pl-1.5">
      {c.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imageUrl} alt="" className="h-7 w-7 rounded-full" />
      ) : (
        <span>{c.emoji}</span>
      )}
      {label ?? c.name}
    </button>
  );
}
