import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { RestaurantCard } from "@/components/customer/cards";
import { EmptyState } from "@/components/ui/misc";
import { facets, searchRestaurants } from "@/server/search";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Restaurants", description: "Restaurants in Lebanon delivering through numnum — cash on delivery." };
export const dynamic = "force-dynamic";

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<{ area?: string; open?: string }> }) {
  const sp = await searchParams;
  const [list, f] = await Promise.all([searchRestaurants({ area: sp.area, page: 1 }), facets()]);
  return (
    <main className="pb-nav">
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-xl" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="container-app pb-2 pt-3">
          <h1 className="text-2xl font-black tracking-tight">Restaurants</h1>
          {f.areas.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              <Link href="/restaurants" className={cn("chip", !sp.area && "chip-active")}>
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
        {list.length ? list.map((r) => <RestaurantCard key={r.id} r={r} />) : <EmptyState icon={<Store />} title="No restaurants here yet" body="New restaurants join every week." />}
      </div>
      <div className="container-app mt-8 text-center">
        <Link href="/business" className="text-sm font-semibold text-brand-600">
          Own a restaurant? Join numnum →
        </Link>
      </div>
    </main>
  );
}
