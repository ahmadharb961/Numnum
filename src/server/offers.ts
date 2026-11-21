import "server-only";
import { prisma } from "./db";
import { allLiveDeals } from "./deals";
import { quoteDelivery, type LatLng } from "@/lib/geo";
import { dealPrice, type DealLike } from "@/lib/deals";

// NumOffers: every restaurant running an offer or deal right now, with the dishes it makes cheaper.

const DISHES_PER_RESTAURANT = 6;

export type OfferDish = { id: string; name: string; priceCents: number; dealPriceCents: number | null; currency: string; image: string | null };
export type OfferRestaurant = {
  id: string;
  slug: string;
  displayName: string;
  logoUrl: string | null;
  coverUrl: string | null;
  cuisine: string | null;
  area: string | null;
  city: string | null;
  verificationStatus: string;
  ratingAvg: number;
  ratingCount: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  openingHours: unknown;
  avgPrepMinutes: number | null;
  currency: string;
  deals: Pick<DealLike, "kind" | "percent" | "amountCents" | "minSubtotalCents" | "menuItemId">[];
  dishNames: Record<string, string>;
  dishes: OfferDish[];
  delivery: { km: number | null; deliverable: boolean; feeCents: number | null } | null;
};

/** How many restaurants have an offer right now (for the NumOffers chip and banner). */
export async function offersCount(blockedIds: string[]) {
  const ids = [...(await allLiveDeals()).keys()].filter((id) => !blockedIds.includes(id));
  if (!ids.length) return 0;
  return prisma.restaurant.count({ where: { id: { in: ids }, status: "ACTIVE" } });
}

/** Biggest saving first: a % off counts as that percent, an amount off and free delivery a little less. */
function strength(deals: DealLike[]) {
  return Math.max(0, ...deals.map((d) => (d.kind === "PERCENT_OFF" ? (d.percent ?? 0) : d.kind === "AMOUNT_OFF" ? 15 : 10)));
}

export async function offerRestaurants(blockedIds: string[], loc: LatLng | null): Promise<OfferRestaurant[]> {
  const byRestaurant = await allLiveDeals();
  const ids = [...byRestaurant.keys()].filter((id) => !blockedIds.includes(id));
  if (!ids.length) return [];
  const restaurants = await prisma.restaurant.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true, slug: true, displayName: true, logoUrl: true, coverUrl: true, cuisine: true, area: true, city: true, verificationStatus: true, ratingAvg: true, ratingCount: true, deliveryEnabled: true, pickupEnabled: true, openingHours: true, avgPrepMinutes: true, currency: true, latitude: true, longitude: true, deliveryZones: true },
  });
  // Dishes: the ones a deal is on, then (for whole-menu deals) the most popular ones.
  const dishIds = [...new Set(restaurants.flatMap((r) => (byRestaurant.get(r.id) ?? []).map((d) => d.menuItemId).filter((x): x is string => !!x)))];
  const dishSelect = { id: true, restaurantId: true, name: true, priceCents: true, currency: true, images: { orderBy: [{ isMain: "desc" as const }, { sortOrder: "asc" as const }], take: 1, select: { asset: { select: { url: true, thumbUrl: true } } } } };
  const [onDeal, popular] = await Promise.all([
    dishIds.length ? prisma.menuItem.findMany({ where: { id: { in: dishIds }, archived: false, available: true }, select: dishSelect }) : Promise.resolve([]),
    prisma.menuItem.findMany({
      where: { restaurantId: { in: restaurants.map((r) => r.id) }, archived: false, available: true },
      orderBy: [{ ratingCount: "desc" }, { viewCount: "desc" }],
      select: dishSelect,
      take: restaurants.length * 12,
    }),
  ]);
  const out = restaurants.map(({ latitude, longitude, deliveryZones, ...r }) => {
    const deals = byRestaurant.get(r.id) ?? [];
    const own = onDeal.filter((d) => d.restaurantId === r.id);
    const wholeMenu = deals.some((d) => !d.menuItemId);
    const rest = wholeMenu || !own.length ? popular.filter((d) => d.restaurantId === r.id && !own.some((o) => o.id === d.id)) : [];
    const dishes = [...own, ...rest].slice(0, DISHES_PER_RESTAURANT).map((d) => ({
      id: d.id,
      name: d.name,
      priceCents: d.priceCents,
      dealPriceCents: dealPrice(deals, d.id, d.priceCents),
      currency: d.currency,
      image: d.images[0]?.asset.thumbUrl ?? d.images[0]?.asset.url ?? null,
    }));
    const q = loc ? quoteDelivery({ latitude, longitude, deliveryZones }, loc) : null;
    return {
      ...r,
      verificationStatus: String(r.verificationStatus),
      deals: deals.map((d) => ({ kind: d.kind, percent: d.percent, amountCents: d.amountCents, minSubtotalCents: d.minSubtotalCents, menuItemId: d.menuItemId })),
      dishNames: Object.fromEntries(own.map((d) => [d.id, d.name])),
      dishes,
      delivery: q ? { km: q.km, deliverable: r.deliveryEnabled && q.deliverable, feeCents: q.deliverable ? q.feeCents : null } : null,
      _strength: strength(deals),
    };
  });
  // Those that deliver to the customer first, then the biggest offers, then the best rated.
  out.sort((a, b) => Number(!!b.delivery?.deliverable) - Number(!!a.delivery?.deliverable) || b._strength - a._strength || b.ratingCount - a.ratingCount);
  return out.map(({ _strength, ...r }) => r);
}
