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

export const metadata: Metadata = { title: "Restaurants", description: "Restaurants in Lebanon delivering through numnum — cash on delivery." };
export const dynamic = "force-dynamic";

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<{ area?: string; near?: string }> }) {
  const sp = await searchParams;
  const loc = await customerLocation();
  const [raw, f] = await Promise.all([searchRestaurants({ area: sp.area, page: 1 }), facets()]);
  // With a location: show distance, deliverable restaurants first, and an optional "delivers to me" filter.
  const withQ = raw.map((r) => ({ r, q: loc ? quoteDelivery(r, loc) : null }));
  const list = (loc ? withQ.filter((x) => sp.near !== "1" || (x.r.deliveryEnabled && x.q?.deliverable)).sort((a, b) => Number(!!b.q?.deliverable) - Number(!!a.q?.deliverable) || (a.q?.km ?? 999) - (b.q?.km ?? 999)) : withQ);
  return (
    <main className="pb-nav">
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-xl" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="container-app pb-2 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-black tracking-tight">Restaurants</h1>
            <LocationChip label={loc?.label ?? null} />
          </div>
          {f.areas.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              {loc && (
                <Link href={sp.near === "1" ? "/restaurants" : "/restaurants?near=1"} className={cn("chip", sp.near === "1" && "chip-active")}>
                  Delivers to me
                </Link>
              )}
              <Link href="/restaurants" className={cn("chip", !sp.area && sp.near !== "1" && "chip-active")}>
                All areas
              </Link>
              {f.areas.map((a) => (
                <Link key={a} href={`/restaurants?area=${encodeURIComponent(a)}`} className={cn("chip", sp.area === a && "chip-active")}>
                  {a}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className="container-app grid gap-3 pt-2">
        {list.length ? list.map(({ r, q }) => <RestaurantCard key={r.id} r={r} delivery={q ? { km: q.km, deliverable: r.deliveryEnabled && q.deliverable, feeCents: q.deliverable ? q.feeCents : null } : null} />) : <EmptyState icon={<Store />} title="No restaurants here yet" body="New restaurants join every week." />}
      </div>
      <div className="container-app mt-8 text-center">
        <Link href="/business" className="text-sm font-semibold text-brand-600">
          Own a restaurant? Join numnum →
        </Link>
      </div>
    </main>
  );
}
