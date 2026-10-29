import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { SearchControls } from "@/components/customer/search-controls";
import { DishCard, ReelThumb, RestaurantCard } from "@/components/customer/cards";
import { EmptyState } from "@/components/ui/misc";
import { facets, parseSearchParams, searchDishes, searchReels, searchRestaurants } from "@/server/search";

export const metadata: Metadata = { title: "Explore food", description: "Search dishes, reels and restaurants across Lebanon." };
export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = parseSearchParams(sp);
  const f = await facets();
  const qs = (patch: Record<string, string>) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(patch)) u.set(k, v);
    return `?${u.toString()}`;
  };

  let body: React.ReactNode;
  if (p.type === "reels") {
    const reels = await searchReels(p);
    body = reels.length ? (
      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl">
        {reels.map((r) => (
          <ReelThumb key={r.id} href={`/reel/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} label={r.item.name} />
        ))}
      </div>
    ) : (
      <EmptyState icon={<Search />} title="No reels found" body="Try another search or category." />
    );
  } else if (p.type === "restaurants") {
    const rs = await searchRestaurants(p);
    body = rs.length ? <div className="grid gap-3">{rs.map((r) => <RestaurantCard key={r.id} r={r} />)}</div> : <EmptyState icon={<Search />} title="No restaurants found" body="Try removing some filters." />;
  } else {
    const res = await searchDishes(p);
    body = res.items.length ? (
      <>
        <p className="mb-2 text-xs font-semibold text-ink-muted">{res.total} dishes</p>
        <div className="grid gap-2.5">
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
  }

  return (
    <main className="pb-nav">
      <Suspense>
        <SearchControls facets={f} />
      </Suspense>
      <div className="container-app pt-2">{body}</div>
    </main>
  );
}
