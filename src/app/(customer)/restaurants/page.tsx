import type { Metadata } from "next";
import Link from "@/components/link";
import { getBlocks } from "@/server/blocks";
import { browseRestaurants, facets } from "@/server/search";
import { offersCount } from "@/server/offers";
import { Flame } from "lucide-react";
import { customerLocation } from "@/server/location";
import { quoteDelivery } from "@/lib/geo";
import { LocationChip } from "@/components/customer/location-picker";
import { RestaurantsBrowser, type BrowseRestaurant } from "@/components/customer/restaurants-browser";
import { getLocale, getT } from "@/i18n/server";
import { localName } from "@/i18n/core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Restaurants"), description: t("Restaurants in Lebanon delivering through numnum — cash on delivery.") };
}
export const dynamic = "force-dynamic";

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<{ area?: string; near?: string; category?: string }> }) {
  const [t, locale, sp, loc, blocks, f] = await Promise.all([getT(), getLocale(), searchParams, customerLocation(), getBlocks(), facets()]);
  const [raw, offers] = await Promise.all([browseRestaurants(blocks.restaurantIds), offersCount(blocks.restaurantIds)]);
  // With a location: the distance on each card, and restaurants that deliver here first.
  const withQ = raw.map(({ latitude, longitude, deliveryZones, ...r }) => {
    const q = loc ? quoteDelivery({ latitude, longitude, deliveryZones }, loc) : null;
    return { r, q, delivery: q ? { km: q.km, deliverable: r.deliveryEnabled && q.deliverable, feeCents: q.deliverable ? q.feeCents : null } : null };
  });
  if (loc) withQ.sort((a, b) => Number(!!b.q?.deliverable) - Number(!!a.q?.deliverable) || (a.q?.km ?? 999) - (b.q?.km ?? 999));
  const restaurants: BrowseRestaurant[] = withQ.map(({ r, delivery }) => ({ r, delivery }));
  const categories = f.categories.map((c) => ({ slug: c.slug, label: localName(locale, c.name, c.nameAr), emoji: c.emoji, imageUrl: c.imageUrl }));

  return (
    <RestaurantsBrowser
      restaurants={restaurants}
      areas={f.areas}
      categories={categories}
      hasLocation={!!loc}
      initial={{ area: sp.area, near: sp.near === "1", category: categories.some((c) => c.slug === sp.category) ? sp.category : undefined }}
      header={
        <div className="flex items-center justify-between gap-2">
          <h1 className="shrink-0 text-2xl font-black tracking-tight">{t("Restaurants")}</h1>
          {/* min-w-0: on small phones the chip shrinks (its label truncates) instead of widening the page */}
          <LocationChip label={loc?.label ?? null} className="min-w-0" />
        </div>
      }
      banner={
        offers > 0 ? (
          // NumOffers comes first: restaurants with offers and deals right now.
          <Link href="/offers" prefetch className="card flex items-center gap-3 bg-gradient-to-r from-brand-600 to-brand-500 p-4 text-white active:scale-[0.99]" data-testid="numoffers-banner">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20">
              <Flame className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-black leading-tight">NumOffers</span>
              <span className="block text-sm text-white/90">{t(offers === 1 ? "1 restaurant with offers and deals now" : "{n} restaurants with offers and deals now", { n: offers })}</span>
            </span>
            <span className="text-xl font-black rtl:-scale-x-100">›</span>
          </Link>
        ) : null
      }
      footer={
        <Link href="/business" className="text-sm font-semibold text-brand-600">
          {t("Own a restaurant? Join numnum →")}
        </Link>
      }
    />
  );
}
