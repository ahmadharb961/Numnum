import type { Metadata } from "next";
import Link from "@/components/link";
import { Flame } from "lucide-react";
import { getBlocks } from "@/server/blocks";
import { customerLocation } from "@/server/location";
import { offerRestaurants } from "@/server/offers";
import { PageHeader } from "@/components/customer/page-header";
import { RestaurantCard } from "@/components/customer/cards";
import { EmptyState } from "@/components/ui/misc";
import { dealText } from "@/lib/deals";
import { formatMoney } from "@/lib/money";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: "NumOffers", description: t("Restaurants with offers and deals right now on numnum.") };
}
export const dynamic = "force-dynamic";

/** NumOffers: every restaurant with an offer or deal right now, and the dishes it makes cheaper. */
export default async function OffersPage() {
  const [t, blocks, loc] = await Promise.all([getT(), getBlocks(), customerLocation()]);
  const list = await offerRestaurants(blocks.restaurantIds, loc ? { lat: loc.lat, lng: loc.lng } : null);
  return (
    <main className="pb-nav">
      <PageHeader title="NumOffers" sub={t("Offers and deals right now")} />
      <div className="container-app space-y-6 pt-4">
        {list.length ? (
          <>
            <p className="text-sm text-ink-muted">{t(list.length === 1 ? "1 restaurant has offers right now. The discount is applied automatically at checkout." : "{n} restaurants have offers right now. The discount is applied automatically at checkout.", { n: list.length })}</p>
            {list.map((r) => (
              <section key={r.id} className="space-y-2" data-testid="offer-restaurant">
                <div className="flex flex-wrap gap-1.5">
                  {r.deals.map((d, i) => {
                    const text = dealText(d, r.currency, d.menuItemId ? (r.dishNames[d.menuItemId] ?? null) : null);
                    return (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white" data-testid="offer-badge">
                        <Flame className="h-3.5 w-3.5" /> {t(text.k, text.v)}
                      </span>
                    );
                  })}
                </div>
                <RestaurantCard r={r} delivery={r.delivery} />
                {r.dishes.length > 0 && (
                  <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
                    {r.dishes.map((d) => (
                      <Link key={d.id} href={`/item/${d.id}`} prefetch className="card w-36 shrink-0 overflow-hidden active:scale-[0.98]" data-testid="offer-dish">
                        <div className="aspect-[4/3] bg-gradient-to-br from-brand-50 to-brand-100">
                          {d.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={d.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                          )}
                        </div>
                        <div className="p-2">
                          <div className="truncate text-sm font-bold">{d.name}</div>
                          <div className="flex items-baseline gap-1.5 text-sm" dir="ltr">
                            {d.dealPriceCents !== null ? (
                              <>
                                <span className="font-extrabold text-brand-600">{formatMoney(d.dealPriceCents, d.currency)}</span>
                                <span className="text-xs text-ink-muted line-through">{formatMoney(d.priceCents, d.currency)}</span>
                              </>
                            ) : (
                              <span className="font-bold">{formatMoney(d.priceCents, d.currency)}</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </>
        ) : (
          <EmptyState icon={<Flame />} title={t("No offers right now")} body={t("Restaurants add offers often. Check back soon.")} action={<Link href="/explore" className="inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 font-bold text-white">{t("Explore food")}</Link>} />
        )}
      </div>
    </main>
  );
}
