import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { RestaurantCard } from "@/components/customer/cards";
import { EmptyState } from "@/components/ui/misc";
import { facets, searchRestaurants } from "@/server/search";
import { cn } from "@/lib/utils";
import { customerLocation } from "@/server/location";
import { quoteDelivery } from "@/lib/geo";
import { LocationChip } from "@/components/customer/location-picker";
import { CategoryTiles } from "@/components/customer/category-tiles";
import { getLocale, getT } from "@/i18n/server";
import { localName } from "@/i18n/core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Restaurants"), description: t("Restaurants in Lebanon delivering through numnum — cash on delivery.") };
}
export const dynamic = "force-dynamic";

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<{ area?: string; near?: string; category?: string }> }) {
  const t = await getT();
  const sp = await searchParams;
  const loc = await customerLocation();
  const [raw, f] = await Promise.all([searchRestaurants({ area: sp.area, category: sp.category, page: 1 }), facets()]);
  // With a location: show distance, deliverable restaurants first, and an optional "delivers to me" filter.
  const withQ = raw.map((r) => ({ r, q: loc ? quoteDelivery(r, loc) : null }));
  const list = (loc ? withQ.filter((x) => sp.near !== "1" || (x.r.deliveryEnabled && x.q?.deliverable)).sort((a, b) => Number(!!b.q?.deliverable) - Number(!!a.q?.deliverable) || (a.q?.km ?? 999) - (b.q?.km ?? 999)) : withQ);
  const category = f.categories.find((c) => c.slug === sp.category);
  // Links keep the other filters: area/near links keep the category, category tiles keep the area.
  const href = (p: { area?: string; near?: string; category?: string }) => {
    const q = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `/restaurants?${q}` : "/restaurants";
  };
  const cat = category?.slug;
  return (
    <main className="pb-nav">
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-xl" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="container-wide pb-2 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-black tracking-tight">{t("Restaurants")}</h1>
            <LocationChip label={loc?.label ?? null} />
          </div>
          {f.areas.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible px-4">
              {loc && (
                <Link href={href({ near: sp.near === "1" ? undefined : "1", category: cat })} className={cn("chip", sp.near === "1" && "chip-active")}>
                  {t("Delivers to me")}
                </Link>
              )}
              <Link href={href({ category: cat })} className={cn("chip", !sp.area && sp.near !== "1" && "chip-active")}>
                {t("All areas")}
              </Link>
              {f.areas.map((a) => (
                <Link key={a} href={href({ area: a, category: cat })} className={cn("chip", sp.area === a && "chip-active")}>
                  {t(a)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>
      <section className="container-wide pt-2" aria-label={t("Food categories")}>
        <CategoryTiles categories={f.categories} active={cat} hrefFor={(slug) => href({ area: sp.area, near: sp.near, category: slug })} />
      </section>
      {category && (
        <div className="container-wide mt-3 flex items-baseline justify-between">
          <h2 className="text-lg font-black">{localName(await getLocale(), category.name, category.nameAr)}</h2>
          <span className="text-sm text-ink-muted">
            {list.length} restaurant{list.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
      <div className="container-wide mt-2 grid gap-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
        {list.length ? list.map(({ r, q }) => <RestaurantCard key={r.id} r={r} delivery={q ? { km: q.km, deliverable: r.deliveryEnabled && q.deliverable, feeCents: q.deliverable ? q.feeCents : null } : null} />) : <EmptyState icon={<Store />} title={category ? `No ${category.name.toLowerCase()} restaurants here yet` : "No restaurants here yet"} body={t("New restaurants join every week.")} />}
      </div>
      <div className="container-app mt-8 text-center">
        <Link href="/business" className="text-sm font-semibold text-brand-600">
          Own a restaurant? Join numnum →
        </Link>
      </div>
    </main>
  );
}
