"use client";

import { useState } from "react";
import { LayoutGrid, Store } from "lucide-react";
import { RestaurantCard } from "./cards";
import { ScrollRow } from "./scroll-row";
import { EmptyState } from "@/components/ui/misc";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Card = Parameters<typeof RestaurantCard>[0]["r"] & { id: string; area: string | null; city: string | null; categories: string[] };
export type BrowseRestaurant = { r: Card; delivery: { km: number | null; deliverable: boolean; feeCents: number | null } | null };
type Category = { slug: string; label: string; emoji: string | null; imageUrl: string | null };
type Filters = { area?: string; near?: boolean; category?: string };

/**
 * The Restaurants tab: every restaurant arrives with the page, so tapping a category, an area or
 * "Delivers to me" filters at once on the phone (no trip to the server). The address bar follows,
 * so a shared link opens the same view.
 */
export function RestaurantsBrowser({ restaurants, areas, categories, hasLocation, initial, header, footer }: { restaurants: BrowseRestaurant[]; areas: string[]; categories: Category[]; hasLocation: boolean; initial: Filters; header: React.ReactNode; footer: React.ReactNode }) {
  const t = useT();
  const [f, setF] = useState<Filters>(initial);

  const apply = (next: Filters) => {
    setF(next);
    const q = new URLSearchParams();
    if (next.area) q.set("area", next.area);
    if (next.near) q.set("near", "1");
    if (next.category) q.set("category", next.category);
    window.history.replaceState(null, "", q.size ? `/restaurants?${q}` : "/restaurants");
  };

  const has = (v: string | null, part: string) => !!v && v.toLowerCase().includes(part.toLowerCase());
  const list = restaurants.filter(
    ({ r, delivery }) =>
      (!f.category || r.categories.includes(f.category)) &&
      (!f.area || has(r.area, f.area) || has(r.city, f.area)) &&
      (!f.near || !hasLocation || (r.deliveryEnabled && !!delivery?.deliverable)),
  );
  const category = categories.find((c) => c.slug === f.category);

  return (
    <main className="pb-nav">
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-xl" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="container-wide pb-2 pt-3">
          {header}
          {areas.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 lg:flex-wrap lg:overflow-visible">
              {hasLocation && (
                <button type="button" onClick={() => apply({ ...f, near: !f.near })} aria-pressed={!!f.near} className={cn("chip", f.near && "chip-active")}>
                  {t("Delivers to me")}
                </button>
              )}
              <button type="button" onClick={() => apply({ category: f.category })} aria-pressed={!f.area && !f.near} className={cn("chip", !f.area && !f.near && "chip-active")}>
                {t("All areas")}
              </button>
              {areas.map((a) => (
                <button key={a} type="button" onClick={() => apply({ area: a, category: f.category })} aria-pressed={f.area === a} className={cn("chip", f.area === a && "chip-active")}>
                  {t(a)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <section className="container-wide pt-2" aria-label={t("Food categories")}>
        <ScrollRow className="-mx-4 gap-1 px-4 pb-2 pt-1 lg:mx-0 lg:gap-2 lg:px-1">
          <Tile active={!f.category} label={t("All")} onClick={() => apply({ ...f, category: undefined })}>
            <LayoutGrid className="h-7 w-7 text-brand-500 lg:h-8 lg:w-8" />
          </Tile>
          {categories.map((c) => (
            <Tile key={c.slug} active={f.category === c.slug} label={c.label} onClick={() => apply({ ...f, category: c.slug })}>
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" width={84} height={84} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl">{c.emoji ?? "🍽️"}</span>
              )}
            </Tile>
          ))}
        </ScrollRow>
      </section>
      {category && (
        <div className="container-wide mt-3 flex items-baseline justify-between">
          <h2 className="text-lg font-black">{category.label}</h2>
          <span className="text-sm text-ink-muted" data-testid="restaurant-count">
            {list.length} restaurant{list.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
      <div className="container-wide mt-2 grid gap-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
        {list.length ? (
          list.map(({ r, delivery }) => <RestaurantCard key={r.id} r={r} delivery={delivery} />)
        ) : (
          <EmptyState icon={<Store />} title={category ? t("No {name} restaurants here yet", { name: category.label.toLowerCase() }) : t("No restaurants here yet")} body={t("New restaurants join every week.")} />
        )}
      </div>
      <div className="container-app mt-8 text-center">{footer}</div>
    </main>
  );
}

function Tile({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="group flex w-[76px] shrink-0 flex-col items-center gap-1.5 lg:w-[96px]">
      <span className={cn("grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full bg-white shadow-[0_2px_4px_rgba(22,18,15,0.06),0_8px_18px_rgba(22,18,15,0.08)] ring-2 transition group-hover:-translate-y-0.5 group-active:scale-95 lg:h-[84px] lg:w-[84px]", active ? "ring-brand-500" : "ring-transparent")}>{children}</span>
      <span className={cn("line-clamp-2 text-center text-xs leading-tight", active ? "font-bold text-brand-600" : "font-semibold text-ink-soft")}>{label}</span>
    </button>
  );
}
