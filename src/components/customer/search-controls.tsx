"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LocationChip } from "./location-picker";
import { setSearching } from "./search-state";

type Facets = { categories: { slug: string; name: string; emoji: string | null }[]; areas: string[]; cuisines: string[] };

export function SearchControls({ facets, locationLabel }: { facets: Facets; locationLabel: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const type = sp.get("type") ?? "dishes";

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Results for all three tabs are already on the page: switch instantly via the URL only.
  const setTab = (t: string) => {
    const next = new URLSearchParams(sp.toString());
    if (t === "dishes") next.delete("type");
    else next.set("type", t);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q.trim()) setParams({ q: q.trim() || null });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Busy from the first keystroke until the new results are on screen.
  const busy = pending || (sp.get("q") ?? "") !== q.trim();
  useEffect(() => setSearching(busy), [busy]);
  useEffect(() => () => setSearching(false), []);

  const activeFilters = ["minPrice", "maxPrice", "cuisine", "area", "delivery", "pickup", "verified", "available", "minRating", "minItemRating"].filter((k) => sp.get(k)).length;

  return (
    <div className="sticky top-0 z-30 bg-cream/95 pb-2 backdrop-blur-xl" style={{ paddingTop: "calc(var(--safe-top) + 10px)" }}>
      <div className="container-wide">
        <div className="mb-2 lg:hidden">
          <LocationChip label={locationLabel} />
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1">
            {busy ? <Loader2 className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-500" aria-label="Searching" /> : <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dishes, restaurants, ingredients…" className="input pl-11 pr-10" type="search" enterKeyHint="search" aria-label="Search" />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button onClick={() => setOpen(true)} className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-black/10 bg-white" aria-label="Filters">
            <SlidersHorizontal className="h-5 w-5" />
            {activeFilters > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[10px] font-bold text-white">{activeFilters}</span>}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 rounded-xl bg-black/5 p-1 text-sm font-semibold">
          {(["dishes", "reels", "restaurants"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("h-9 rounded-lg capitalize transition", type === t ? "bg-white shadow-sm" : "text-ink-muted")}>
              {t}
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
