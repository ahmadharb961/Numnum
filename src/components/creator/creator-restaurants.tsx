"use client";

import { useState } from "react";
import { BadgeCheck, Clapperboard, Plus, Search, Store, Utensils } from "lucide-react";
import Link from "@/components/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatKm } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/i18n/client";

export type ShootRestaurant = {
  id: string;
  slug: string;
  displayName: string;
  logoUrl: string | null;
  cuisine: string | null;
  area: string | null;
  city: string | null;
  verificationStatus: string;
  dishes: number;
  creatorReels: number;
  km: number | null;
};

/**
 * Restaurants on numnum a creator can film: search by name, filter by area, see the menu to plan
 * the shoot, or start a reel already tagged to that restaurant.
 */
export function CreatorRestaurants({ restaurants, areas, canPost }: { restaurants: ShootRestaurant[]; areas: string[]; canPost: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const term = q.trim().toLowerCase();
  const list = restaurants.filter(
    (r) => (!area || r.area === area) && (!term || r.displayName.toLowerCase().includes(term) || (r.cuisine ?? "").toLowerCase().includes(term) || (r.area ?? "").toLowerCase().includes(term)),
  );

  return (
    <div className="space-y-4" data-testid="shoot-restaurants">
      <p className="text-sm text-ink-muted">{t("These restaurants are on numnum. Film a dish from their menu, then tag it: they approve it and your reel goes live with an Order button.")}</p>
      <span className="relative block">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search a restaurant, cuisine or area")} className="input ps-9" data-testid="shoot-search" />
      </span>
      {areas.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button type="button" onClick={() => setArea(null)} aria-pressed={!area} className={cn("chip", !area && "chip-active")}>
            {t("All areas")}
          </button>
          {areas.map((a) => (
            <button key={a} type="button" onClick={() => setArea(a)} aria-pressed={area === a} className={cn("chip", area === a && "chip-active")}>
              {t(a)}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs font-semibold text-ink-muted">{t(list.length === 1 ? "{n} restaurant" : "{n} restaurants", { n: list.length })}</p>
      {list.length ? (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="card p-4" data-testid="shoot-restaurant">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-50 text-brand-500">
                  {r.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Store className="h-6 w-6" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-bold">
                    <span className="truncate">{r.displayName}</span>
                    {r.verificationStatus === "VERIFIED" && <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" aria-label={t("Verified")} />}
                  </div>
                  <div className="truncate text-xs text-ink-muted">{[r.cuisine && t(r.cuisine), r.area && t(r.area), r.km != null && formatKm(r.km, locale)].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="inline-flex items-center gap-1 text-ink-soft">
                      <Utensils className="h-3.5 w-3.5" /> {t(r.dishes === 1 ? "{n} dish" : "{n} dishes", { n: r.dishes })}
                    </span>
                    <span className={cn("inline-flex items-center gap-1", r.creatorReels ? "text-emerald-700" : "font-semibold text-brand-600")}>
                      <Clapperboard className="h-3.5 w-3.5" />
                      {r.creatorReels ? t(r.creatorReels === 1 ? "{n} creator reel" : "{n} creator reels", { n: r.creatorReels }) : t("Be the first creator here")}
                    </span>
                  </div>
                </div>
              </div>
              <div className={cn("mt-3 grid gap-2", canPost ? "grid-cols-2" : "grid-cols-1")}>
                <Link href={`/r/${r.slug}`} className={buttonClass("outline", "sm")} data-testid="shoot-menu">
                  {t("See the menu")}
                </Link>
                {canPost && (
                  <Link href={`/creator/new?q=${encodeURIComponent(r.displayName)}`} className={buttonClass("primary", "sm")} data-testid="shoot-post">
                    <Plus className="h-4 w-4" /> {t("Post a reel here")}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Store />} title={t("No restaurants found")} body={restaurants.length ? t("Try another name or area.") : t("New restaurants join every week. Check back soon.")} />
      )}
    </div>
  );
}
