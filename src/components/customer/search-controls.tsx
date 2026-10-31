"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { History, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LocationChip } from "./location-picker";
import { setCounts, setQuery, setSearching, useCounts, useQuery } from "./search-state";
import { useSearchIndex } from "./instant-search";

type Facets = { categories: { slug: string; name: string; emoji: string | null }[]; areas: string[]; cuisines: string[] };

const RECENT = "nn-recent-searches";
export function recentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
  } catch {
    return [];
  }
}
/** Remembers a search the person acted on (opened a result), newest first. */
export function rememberSearch(q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  try {
    localStorage.setItem(RECENT, JSON.stringify([t, ...recentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6)));
  } catch {}
}

export function SearchControls({ facets, locationLabel }: { facets: Facets; locationLabel: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const index = useSearchIndex();
  const counts = useCounts();
  const type = sp.get("type") ?? "dishes";

  // With the search index loaded, results are computed in the browser: the URL is only kept in
  // sync (for back/share), without asking the server again.
  const go = (next: URLSearchParams) => {
    const url = `${pathname}${next.size ? `?${next}` : ""}`;
    if (index) window.history.replaceState(null, "", url);
    else start(() => router.replace(url, { scroll: false }));
  };
  // Read the live URL (not the last render's): typing and tab taps update it independently.
  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    go(next);
  };

  // Results for all three tabs are already on the page: switch instantly via the URL only.
  const setTab = (t: string) => {
    const next = new URLSearchParams(window.location.search);
    if (t === "dishes") next.delete("type");
    else next.set("type", t);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  const type_ = (v: string) => {
    setQ(v);
    setQuery(v);
  };
  useEffect(() => setQuery(q), []); // eslint-disable-line react-hooks/exhaustive-deps
  // The results can change the search too (tapping "All Pizza" clears the text).
  const storeQ = useQuery();
  const synced = useRef(false);
  useEffect(() => {
    if (!synced.current) {
      synced.current = true;
      return;
    }
    if (storeQ !== q) setQ(storeQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeQ]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q.trim()) setParams({ q: q.trim() || null });
    }, index ? 400 : 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Only a server search (before the index arrives) needs a loader; local results are instant.
  const busy = !index && (pending || (sp.get("q") ?? "") !== q.trim());
  useEffect(() => setSearching(busy), [busy]);
  useEffect(
    () => () => {
      setSearching(false);
      setCounts(null);
      setQuery("");
    },
    [],
  );

  const activeFilters = ["minPrice", "maxPrice", "cuisine", "area", "delivery", "pickup", "verified", "available", "minRating", "minItemRating"].filter((k) => sp.get(k)).length;
  const showRecent = focused && !q && recent.length > 0;

  return (
    <div className="sticky top-0 z-30 bg-cream/95 pb-2 backdrop-blur-xl" style={{ paddingTop: "calc(var(--safe-top) + 10px)" }}>
      <div className="container-wide">
        <div className="mb-2 lg:hidden">
          <LocationChip label={locationLabel} />
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1">
            {busy ? <Loader2 className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-500" aria-label="Searching" /> : <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />}
            <input
              value={q}
              onChange={(e) => type_(e.target.value)}
              onFocus={() => (setFocused(true), setRecent(recentSearches()))}
              onBlur={(e) => {
                const el = e.currentTarget;
                // Delay so a tap on a "Recent" chip lands first; stay open if focus came back.
                setTimeout(() => setFocused(document.activeElement === el), 150);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), rememberSearch(q))}
              placeholder="Search food or restaurants"
              className="input pl-11 pr-10"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Search"
            />
            {q && (
              <button onClick={() => type_("")} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button onClick={() => setOpen(true)} className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-black/10 bg-white" aria-label="Filters">
            <SlidersHorizontal className="h-5 w-5" />
            {activeFilters > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[10px] font-bold text-white">{activeFilters}</span>}
          </button>
        </div>
        {showRecent && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-muted">Recent</span>
            {recent.map((r) => (
              <button key={r} onMouseDown={(e) => e.preventDefault()} onClick={() => type_(r)} className="chip h-8 text-xs">
                <History className="h-3.5 w-3.5" /> {r}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 rounded-xl bg-black/5 p-1 text-sm font-semibold">
          {(["dishes", "reels", "restaurants"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("h-9 rounded-lg capitalize transition", type === t ? "bg-white shadow-sm" : "text-ink-muted")}>
              {t}
              {q.trim() && counts && <span className={cn("ml-1 tabular text-xs", type === t ? "text-brand-600" : "text-ink-muted/70")}>{counts[t]}</span>}
            </button>
          ))}
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible px-4">
          <button onClick={() => setParams({ category: null })} className={cn("chip", !sp.get("category") && "chip-active")}>
            All
          </button>
          {facets.categories.map((c) => (
            <button key={c.slug} onClick={() => setParams({ category: sp.get("category") === c.slug ? null : c.slug })} className={cn("chip", sp.get("category") === c.slug && "chip-active")}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </div>
      {busy && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-brand-100">
          <div className="h-full w-1/3 animate-[search-bar_1s_ease-in-out_infinite] rounded-full bg-brand-500" />
        </div>
      )}
      <FilterSheet open={open} onClose={() => setOpen(false)} facets={facets} current={sp} apply={(p) => { setParams(p); setOpen(false); }} />
    </div>
  );
}

function FilterSheet({ open, onClose, facets, current, apply }: { open: boolean; onClose: () => void; facets: Facets; current: URLSearchParams; apply: (p: Record<string, string | null>) => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setF(Object.fromEntries(current.entries()));
  }, [open, current]);
  const toggle = (k: string) => setF((p) => ({ ...p, [k]: p[k] === "1" ? "" : "1" }));
  const keys = ["minPrice", "maxPrice", "cuisine", "area", "delivery", "pickup", "verified", "available", "minRating", "minItemRating"];
  return (
    <Sheet open={open} onClose={onClose} title="Filters">
      <div className="space-y-5 p-5">
        <div>
          <div className="label">Price range (USD)</div>
          <div className="flex items-center gap-2">
            <input className="input" inputMode="decimal" placeholder="Min" value={f.minPrice ?? ""} onChange={(e) => setF({ ...f, minPrice: e.target.value })} />
            <span className="text-ink-muted">–</span>
            <input className="input" inputMode="decimal" placeholder="Max" value={f.maxPrice ?? ""} onChange={(e) => setF({ ...f, maxPrice: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Cuisine</label>
            <select className="input" value={f.cuisine ?? ""} onChange={(e) => setF({ ...f, cuisine: e.target.value })}>
              <option value="">Any</option>
              {facets.cuisines.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Area</label>
            <select className="input" value={f.area ?? ""} onChange={(e) => setF({ ...f, area: e.target.value })}>
              <option value="">Anywhere</option>
              {facets.areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["delivery", "Delivers to me"],
            ["pickup", "Pickup"],
            ["verified", "Verified restaurants"],
            ["available", "Available now"],
          ].map(([k, label]) => (
            <button key={k} type="button" onClick={() => toggle(k)} className={cn("chip", f[k] === "1" && "chip-active")}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Restaurant rating</label>
            <select className="input" value={f.minRating ?? ""} onChange={(e) => setF({ ...f, minRating: e.target.value })}>
              <option value="">Any</option>
              <option value="3">3★ & up</option>
              <option value="4">4★ & up</option>
              <option value="4.5">4.5★ & up</option>
            </select>
          </div>
          <div>
            <label className="label">Dish rating</label>
            <select className="input" value={f.minItemRating ?? ""} onChange={(e) => setF({ ...f, minItemRating: e.target.value })}>
              <option value="">Any</option>
              <option value="3">3★ & up</option>
              <option value="4">4★ & up</option>
              <option value="4.5">4.5★ & up</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" onClick={() => apply(Object.fromEntries(keys.map((k) => [k, null])))}>
            Reset
          </Button>
          <Button onClick={() => apply(Object.fromEntries(keys.map((k) => [k, f[k] || null])))}>Show results</Button>
        </div>
      </div>
    </Sheet>
  );
}
