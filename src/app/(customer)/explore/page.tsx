import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { SearchControls } from "@/components/customer/search-controls";
import { DishCard, ReelThumb, RestaurantCard } from "@/components/customer/cards";
import { EmptyState } from "@/components/ui/misc";
import { facets, parseSearchParams, searchDishes, searchReels, searchRestaurants, restaurantsDeliveringTo } from "@/server/search";
import { customerLocation } from "@/server/location";
import { ExploreResults } from "@/components/customer/explore-results";

export const metadata: Metadata = { title: "Explore food", description: "Search dishes, reels and restaurants across Lebanon." };
export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = parseSearchParams(sp);
  const loc = await customerLocation();
  if (p.delivery && loc) p.nearIds = await restaurantsDeliveringTo(loc);
  const [f, reels, rs, res] = await Promise.all([facets(), searchReels(p), searchRestaurants({ ...p, page: 1 }), searchDishes(p)]);
  const qs = (patch: Record<string, string>) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(patch)) u.set(k, v);
    return `?${u.toString()}`;
  };

  const reelsBody = reels.length ? (
    <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl lg:grid-cols-5 lg:gap-2">
      {reels.map((r) => (
        <ReelThumb key={r.id} href={`/reel/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} label={r.item.name} />
      ))}
    </div>
  ) : (
    <EmptyState icon={<Search />} title="No reels found" body="Try another search or category." />
  );
  const restaurantsBody = rs.length ? <div className="grid gap-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">{rs.map((r) => <RestaurantCard key={r.id} r={r} />)}</div> : <EmptyState icon={<Search />} title="No restaurants found" body="Try removing some filters." />;
  const dishesBody = res.items.length ? (
    <>
      <p className="mb-2 text-xs font-semibold text-ink-muted">{res.total} dishes</p>
      <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-4">
        {res.items.map((i) => (
          <DishCard key={i.id} item={i} />
        ))}
      </div>
      {res.pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {(p.page ?? 1) > 1 && (
            <Link className="chip" href={qs({ page: String((p.page ?? 1) - 1) })}>
              Previous
            </Link>
          )}
          {(p.page ?? 1) < res.pages && (
            <Link className="chip" href={qs({ page: String((p.page ?? 1) + 1) })}>
              Next
            </Link>
          )}
        </div>
      )}
    </>
  ) : (
    <EmptyState icon={<Search />} title="No dishes found" body="Try a different dish, ingredient or area." />
  );

return (
  <main className="pb-nav">
    <Suspense>
      <SearchControls facets={f} locationLabel={loc?.label ?? null} />
    </Suspense>
      <div className="container-wide pt-2">
        <Suspense>
          <ExploreResults dishes={dishesBody} reels={reelsBody} restaurants={restaurantsBody} />
        </Suspense>
      </div>
    </main>
  );
}
