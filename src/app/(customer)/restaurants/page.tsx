import type { Metadata } from "next";
import Link from "next/link";
import { getBlocks } from "@/server/blocks";
import { browseRestaurants, facets } from "@/server/search";
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
  const raw = await browseRestaurants(blocks.restaurantIds);
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
      footer={
        <Link href="/business" className="text-sm font-semibold text-brand-600">
          {t("Own a restaurant? Join numnum →")}
        </Link>
      }
    />
  );
}
