import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock, Eye, Instagram, MapPin, Phone, Share2, Bike, ShoppingBag, Globe } from "lucide-react";
import { getPublicRestaurant } from "@/server/restaurant-public";
import { ownerKey } from "@/server/engagement";
import { prisma } from "@/server/db";
import { ProfileTabs, SaveToggle, ShareButton } from "@/components/customer/restaurant-profile";
import { VerifiedBadge, Stars, Badge } from "@/components/ui/misc";
import { DAYS, DAY_LABELS, isOpenAt, type OpeningHours } from "@/lib/hours";
import { formatPhone } from "@/lib/phone";
import { compactNumber, formatDate } from "@/lib/utils";
import { evidenceLabel } from "@/server/reviews";
import { ReportButton } from "@/components/customer/report-button";
import { customerLocation } from "@/server/location";
import { formatKm, normalizeZones, quoteDelivery } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { LocationChip } from "@/components/customer/location-picker";
import { RestaurantViewTracker } from "@/components/customer/item-view-tracker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getPublicRestaurant((await params).slug);
  if (!data) return { title: "Restaurant not found" };
  const r = data.restaurant;
  const description = r.description?.slice(0, 160) || `Watch reels and order from ${r.displayName} with cash on delivery.`;
  return {
    title: `${r.displayName}${r.area ? ` · ${r.area}` : ""}`,
    description,
    alternates: { canonical: `/r/${r.slug}` },
    openGraph: { title: r.displayName, description, images: r.coverUrl || r.logoUrl ? [{ url: (r.coverUrl || r.logoUrl)! }] : undefined },
  };
}

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getPublicRestaurant((await params).slug);
  if (!data) notFound();
  const { restaurant: r, sections, reels, reviews, subRatings } = data;
  const key = await ownerKey();
  const saved = key ? !!(await prisma.savedItem.findUnique({ where: { ownerKey_type_refId: { ownerKey: key, type: "RESTAURANT", refId: r.id } } })) : false;
  const loc = await customerLocation();
  const dq = loc ? quoteDelivery(r, loc) : null;
  const hours = (r.openingHours ?? {}) as OpeningHours;
  const open = isOpenAt(hours);
  const social = (r.socialLinks ?? {}) as Record<string, string>;
  const mapsHref = r.mapsUrl || (r.latitude && r.longitude ? `https://maps.google.com/?q=${r.latitude},${r.longitude}` : r.address ? `https://maps.google.com/?q=${encodeURIComponent(`${r.displayName} ${r.address}`)}` : null);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.displayName,
    description: r.description ?? undefined,
    image: r.coverUrl || r.logoUrl || undefined,
    servesCuisine: r.cuisine ?? undefined,
    address: r.address ? { "@type": "PostalAddress", streetAddress: r.address, addressLocality: r.city ?? r.area ?? undefined, addressCountry: "LB" } : undefined,
    aggregateRating: r.ratingCount ? { "@type": "AggregateRating", ratingValue: r.ratingAvg.toFixed(1), reviewCount: r.ratingCount } : undefined,
    telephone: r.phone ? `+${r.phone}` : undefined,
  };

  return (
    <main className="profile-desktop pb-nav lg:mx-auto lg:max-w-4xl lg:px-8 lg:pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <RestaurantViewTracker restaurantId={r.id} />
      <div className="relative h-56 bg-gradient-to-br from-brand-200 to-brand-400 sm:h-72 lg:overflow-hidden lg:rounded-3xl">
        {r.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.coverUrl} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 top-0 flex justify-between px-3" style={{ paddingTop: "calc(var(--safe-top) + 10px)" }}>
          <Link href="/restaurants" className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur" aria-label="Back">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <ShareButton title={r.displayName} path={`/r/${r.slug}`} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur">
            <Share2 className="h-5 w-5" />
          </ShareButton>
        </div>
      </div>
      <div className="container-app">
        <div className="relative z-10 -mt-10 flex items-end gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-3xl border-4 border-cream bg-white shadow-md">
            {r.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.logoUrl} alt={`${r.displayName} logo`} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center bg-brand-500 text-3xl font-black text-white">{r.displayName[0]}</div>
            )}
          </div>
          <div className="flex flex-1 justify-end gap-2 pb-1">
            <SaveToggle type="RESTAURANT" refId={r.id} initial={saved} className="h-9 rounded-full border border-black/10 bg-white px-4 text-sm font-semibold" />
          </div>
        </div>
        <h1 className="mt-2 flex items-center gap-1.5 text-2xl font-black tracking-tight">
          {r.displayName}
          {r.verificationStatus === "APPROVED" && <VerifiedBadge className="[&_svg]:h-5 [&_svg]:w-5" />}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          {r.cuisine && <span>{r.cuisine}</span>}
          {(r.area || r.city) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {[r.area, r.city].filter(Boolean).join(", ")}
            </span>
          )}
          {open !== null && <Badge tone={open ? "green" : "gray"}>{open ? "Open now" : "Closed now"}</Badge>}
        </div>
        {r.description && <p className="mt-2.5 text-[15px] leading-relaxed text-ink-soft">{r.description}</p>}

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            [r.ratingCount ? r.ratingAvg.toFixed(1) : "–", `${r.ratingCount} review${r.ratingCount === 1 ? "" : "s"}`],
            [compactNumber(r.totalReelViews), "reel views"],
            [String(r._count.menuItems), "menu items"],
            [String(r._count.reels), "reels"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-white py-2.5">
              <div className="tabular text-lg font-extrabold">{v}</div>
              <div className="text-[11px] text-ink-muted">{l}</div>
            </div>
          ))}
        </div>

        {r.deliveryEnabled && (
          <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm ${dq?.deliverable ? "bg-emerald-50 text-emerald-900" : dq ? "bg-amber-50 text-amber-900" : "bg-white"}`}>
            <span className="inline-flex items-center gap-2 font-semibold">
              <Bike className="h-4 w-4" />
              {!dq && "Set your location to check delivery"}
              {dq?.deliverable && `Delivers to ${loc!.label} · ${formatKm(dq.km)} · ${dq.feeCents ? formatMoney(dq.feeCents, r.currency) : "free delivery"}`}
              {dq && !dq.deliverable && (dq.reason === "out_of_range" ? `${formatKm(dq.km!)} away — delivers up to ${formatKm(dq.maxKm)}${r.pickupEnabled ? " · pickup available" : ""}` : "Delivery not set up yet")}
            </span>
            <LocationChip label={loc?.label ?? null} className="bg-white/80" />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={r.deliveryEnabled ? "brand" : "gray"}>
            <Bike className="h-3.5 w-3.5" /> {r.deliveryEnabled ? "Delivery" : "No delivery"}
          </Badge>
          <Badge tone={r.pickupEnabled ? "brand" : "gray"}>
            <ShoppingBag className="h-3.5 w-3.5" /> {r.pickupEnabled ? "Pickup" : "No pickup"}
          </Badge>
          {!r.orderingEnabled && <Badge tone="amber">Not taking online orders right now</Badge>}
        </div>

        <details className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
            <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4" /> Hours, location & contact
            </span>
            <span className="text-ink-muted">›</span>
          </summary>
          <div className="mt-3 space-y-3">
            {Object.keys(hours).length > 0 && (
              <table className="w-full text-sm">
                <tbody>
                  {DAYS.map((d) => (
                    <tr key={d}>
                      <td className="py-0.5 text-ink-muted">{DAY_LABELS[d]}</td>
                      <td className="py-0.5 text-right">{hours[d]?.length ? hours[d]!.map((s) => `${s.open}–${s.close}`).join(", ") : "Closed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.address && <p>{r.address}</p>}
            {r.deliveryEnabled && normalizeZones(r.deliveryZones).length > 0 && (
              <p className="text-ink-muted">
                Delivery: {normalizeZones(r.deliveryZones).map((z) => `up to ${formatKm(z.maxKm)} ${z.feeCents ? formatMoney(z.feeCents, r.currency) : "free"}`).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="chip">
                  <MapPin className="h-4 w-4" /> Google Maps
                </a>
              )}
              {r.phone && (
                <a href={`tel:+${r.phone}`} className="chip">
                  <Phone className="h-4 w-4" /> {formatPhone(r.phone)}
                </a>
              )}
              {social.instagram && (
                <a href={social.instagram} target="_blank" rel="noopener noreferrer nofollow" className="chip">
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              )}
              {social.website && (
                <a href={social.website} target="_blank" rel="noopener noreferrer nofollow" className="chip">
                  <Globe className="h-4 w-4" /> Website
                </a>
              )}
            </div>
          </div>
        </details>
      </div>

      <div className="mt-4">
        <ProfileTabs slug={r.slug} sections={sections} reels={reels} orderingEnabled={r.orderingEnabled} />
      </div>

      <section className="container-app mt-6" id="reviews">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Restaurant reviews</h2>
          <Link href={`/r/${r.slug}/review`} className="text-sm font-semibold text-brand-600">
            Write a review
          </Link>
        </div>
        {r.ratingCount > 0 && (
          <div className="mt-3 rounded-2xl bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="text-4xl font-extrabold">{r.ratingAvg.toFixed(1)}</span>
              <div>
                <Stars value={r.ratingAvg} />
                <div className="text-xs text-ink-muted">{r.ratingCount} reviews</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {(
                [
                  ["Food quality", subRatings.foodQuality],
                  ["Service", subRatings.service],
                  ["Value", subRatings.value],
                  ["Delivery", subRatings.delivery],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-ink-muted">{l}</span>
                    <span className="font-semibold">{v!.toFixed(1)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
        <ul className="mt-3 space-y-3">
          {reviews.map((rv) => (
            <li key={rv.id} className="rounded-2xl bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{rv.userName}</span>
                <span className="text-xs text-ink-muted">{formatDate(rv.createdAt)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <Stars value={rv.rating} size={13} />
                {evidenceLabel(rv.evidence) && <Badge tone="green">{evidenceLabel(rv.evidence)}</Badge>}
              </div>
              {rv.body && <p className="mt-2 text-sm text-ink-soft">{rv.body}</p>}
              {rv.reply && (
                <div className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm">
                  <div className="text-xs font-bold text-ink-soft">Reply from {r.displayName}</div>
                  <p className="mt-0.5 text-ink-soft">{rv.reply}</p>
                </div>
              )}
              <div className="mt-2 text-right">
                <ReportButton targetType="RESTAURANT_REVIEW" targetId={rv.id} />
              </div>
            </li>
          ))}
          {!reviews.length && <p className="text-sm text-ink-muted">No reviews yet.</p>}
        </ul>
        <div className="mt-6 flex items-center justify-center gap-1 pb-4 text-xs text-ink-muted">
          <Eye className="h-3.5 w-3.5" /> Verified badge confirms business identity, not food quality. ·
          <ReportButton targetType="RESTAURANT" targetId={r.id} label="Report" />
        </div>
      </section>
    </main>
  );
}
