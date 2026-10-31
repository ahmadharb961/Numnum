import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchControls } from "@/components/customer/search-controls";
import { ExploreResults } from "@/components/customer/explore-results";
import { facets, parseSearchParams, restaurantsDeliveringTo } from "@/server/search";
import { exploreSearch } from "@/server/explore-search";
import { customerLocation } from "@/server/location";

export const metadata: Metadata = { title: "Explore food", description: "Search dishes, reels and restaurants across Lebanon." };
export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = parseSearchParams(sp);
  const loc = await customerLocation();
  if (p.delivery && loc) p.nearIds = await restaurantsDeliveringTo(loc);
  // First page comes with the HTML; after that the browser asks /api/search as the person types.
  const [f, initial] = await Promise.all([facets(), exploreSearch({ ...p, page: 1 }, loc ? { lat: loc.lat, lng: loc.lng } : null)]);
  return (
    <main className="pb-nav">
      <Suspense>
        <SearchControls facets={f} locationLabel={loc?.label ?? null} />
      </Suspense>
      <div className="container-wide pt-2">
        <Suspense>
          <ExploreResults initial={initial} categories={f.categories} />
        </Suspense>
      </div>
    </main>
  );
}
