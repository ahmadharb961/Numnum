import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Bike, ChevronLeft, ChevronRight, Clapperboard, Clock, ConciergeBell, Globe, Instagram, MapPin, Phone, PlayCircle, Share2, ShoppingBag, Star, UtensilsCrossed } from "lucide-react";
import { getPublicRestaurant } from "@/server/restaurant-public";
import { ownerKey } from "@/server/engagement";
import { prisma } from "@/server/db";
import { ProfileTabs, SaveToggle, ShareButton } from "@/components/customer/restaurant-profile";
import { VerifiedBadge, Stars, Badge, EmptyState } from "@/components/ui/misc";
import { DAYS, DAY_LABELS, isOpenAt, type OpeningHours } from "@/lib/hours";
import { formatPhone } from "@/lib/phone";
import { compactNumber, formatDate } from "@/lib/utils";
import { evidenceLabel } from "@/server/reviews";
import { ReportButton } from "@/components/customer/report-button";
import { customerLocation } from "@/server/location";
import { formatKm, normalizeZones, quoteDelivery } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { DeliverToButton } from "@/components/customer/location-picker";
import { RestaurantViewTracker } from "@/components/customer/item-view-tracker";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getPublicRestaurant((await params).slug);
  if (!data) return { title: (await getT())("Restaurant not found") };
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
  const t = await getT();
  const lang = await getLocale();
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

  const prep = r.avgPrepMinutes || 20;
  const card = "rounded-2xl bg-white shadow-[0_1px_2px_rgba(22,18,15,0.05),0_6px_20px_rgba(22,18,15,0.05)]";
  const deliveryLine = !r.deliveryEnabled
    ? null
    : !dq
      ? null
      : dq.deliverable
        ? { ok: true, text: `${formatKm(dq.km)} · ${dq.feeCents ? t("Delivery fee") + " " + formatMoney(dq.feeCents, r.currency) : t("free delivery")}` }
        : { ok: false, text: dq.reason === "out_of_range" ? t("{km} away — delivers up to {max}", { km: formatKm(dq.km!), max: formatKm(dq.maxKm) }) + (r.pickupEnabled ? ` · ${t("pickup available")}` : "") : t("Delivery not set up yet") };

  const about = (
    <div className="space-y-4 pb-4">
      {r.description && <p className={`${card} p-4 text-[15px] leading-relaxed text-ink-soft`}>{r.description}</p>}
      {Object.keys(hours).length > 0 && (
        <div className={`${card} p-4`}>
          <h3 className="mb-2 flex items-center gap-2 font-extrabold">
            <Clock className="h-4 w-4 text-brand-500" /> {t("Opening hours")}
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td className="py-1 text-ink-muted">{t(DAY_LABELS[d])}</td>
                  <td className="py-1 text-end tabular">{hours[d]?.length ? hours[d]!.map((sl) => (sl.open === sl.close ? t("Open 24 hours") : `${sl.open}–${sl.close}`)).join(", ") : t("Closed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={`${card} space-y-3 p-4 text-sm`}>
        <h3 className="flex items-center gap-2 font-extrabold">
          <MapPin className="h-4 w-4 text-brand-500" /> {t("Location")}
        </h3>
        {r.address && <p>{r.address}</p>}
        {r.deliveryEnabled && normalizeZones(r.deliveryZones).length > 0 && (
          <p className="text-ink-muted">
            {t("Delivery")}: {normalizeZones(r.deliveryZones).map((z) => `${t("up to {km}", { km: formatKm(z.maxKm) })} ${z.feeCents ? formatMoney(z.feeCents, r.currency) : t("free")}`).join(" · ")}
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
              <Phone className="h-4 w-4" /> <span className="tabular">{formatPhone(r.phone)}</span>
            </a>
          )}
          {social.instagram && (
            <a href={social.instagram} target="_blank" rel="noopener noreferrer nofollow" className="chip">
              <Instagram className="h-4 w-4" /> Instagram
            </a>
          )}
          {social.website && (
            <a href={social.website} target="_blank" rel="noopener noreferrer nofollow" className="chip">
              <Globe className="h-4 w-4" /> {t("Website")}
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 pt-2 text-center text-xs text-ink-muted">
        <p className="max-w-xs text-balance">
          <BadgeCheck className="me-1 inline h-3.5 w-3.5 align-[-2px]" />
          {t("The verified badge confirms business identity, not food quality.")}
        </p>
        <ReportButton targetType="RESTAURANT" targetId={r.id} label={t("Report this restaurant")} />
      </div>
    </div>
  );

  const reviewsTab = (
    <section className="pb-4" id="reviews-list">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">{t("Restaurant reviews")}</h2>
        <Link href={`/r/${r.slug}/review`} className="text-sm font-semibold text-brand-600">
          {t("Write a review")}
        </Link>
      </div>
      {r.ratingCount > 0 && (
        <div className={`mt-3 ${card} p-4`}>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-extrabold">{r.ratingAvg.toFixed(1)}</span>
            <div>
              <Stars value={r.ratingAvg} />
              <div className="text-xs text-ink-muted">{t("{n} reviews", { n: r.ratingCount })}</div>
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
                  <span className="text-ink-muted">{t(l)}</span>
                  <span className="font-semibold">{v!.toFixed(1)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      <ul className="mt-3 space-y-3">
        {reviews.map((rv) => (
          <li key={rv.id} className={`${card} p-4`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{rv.userName}</span>
              <span className="text-xs text-ink-muted">{formatDate(rv.createdAt, undefined, lang)}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <Stars value={rv.rating} size={13} />
              {evidenceLabel(rv.evidence) && <Badge tone="green">{evidenceLabel(rv.evidence)}</Badge>}
            </div>
            {rv.body && <p className="mt-2 text-sm text-ink-soft">{rv.body}</p>}
            {rv.reply && (
              <div className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm">
                <div className="text-xs font-bold text-ink-soft">{t("Reply from {name}", { name: r.displayName })}</div>
                <p className="mt-0.5 text-ink-soft">{rv.reply}</p>
              </div>
            )}
            <div className="mt-2 text-end">
              <ReportButton targetType="RESTAURANT_REVIEW" targetId={rv.id} />
            </div>
          </li>
        ))}
        {!reviews.length && <EmptyState icon={<Star />} title={t("No reviews yet")} body={t("Your review helps other food lovers.")} />}
      </ul>
    </section>
  );

  const stats: { icon: React.ReactNode; value: string; label: string; href?: string }[] = [
    { icon: <Star className="h-6 w-6 fill-brand-500 text-brand-500" />, value: r.ratingCount ? r.ratingAvg.toFixed(1) : "–", label: r.ratingCount ? `(${t(r.ratingCount === 1 ? "{n} review" : "{n} reviews", { n: r.ratingCount })})` : t("New"), href: "#reviews" },
    { icon: <PlayCircle className="h-6 w-6 text-brand-500" />, value: compactNumber(r.totalReelViews), label: t("reel views"), href: "#reels" },
    { icon: <ConciergeBell className="h-6 w-6 text-brand-500" />, value: String(r._count.menuItems), label: t("menu items"), href: "#menu" },
    { icon: <Clapperboard className="h-6 w-6 text-brand-500" />, value: String(r._count.reels), label: t("reels"), href: "#reels" },
  ];

  return (
    <main className="profile-desktop pb-nav lg:mx-auto lg:max-w-4xl lg:px-8 lg:pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <RestaurantViewTracker restaurantId={r.id} />
      {/* Cover photo with a soft curved bottom edge */}
      <div className="relative h-60 sm:h-72 lg:h-80">
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-200 to-brand-400 [clip-path:ellipse(135%_100%_at_50%_0%)] lg:rounded-t-3xl">
          {r.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.coverUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4" style={{ paddingTop: "calc(var(--safe-top) + 10px)" }}>
          <Link href="/restaurants" className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-ink shadow-md backdrop-blur" aria-label={t("Back")}>
            <ChevronLeft className="h-6 w-6 rtl:-scale-x-100" />
          </Link>
          <div className="flex gap-2.5">
            <SaveToggle heart type="RESTAURANT" refId={r.id} initial={saved} className="grid h-11 w-11 place-items-center rounded-full bg-white/95 shadow-md backdrop-blur active:scale-90" />
            <ShareButton title={r.displayName} path={`/r/${r.slug}`} className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-ink shadow-md backdrop-blur">
              <Share2 className="h-5 w-5" />
            </ShareButton>
          </div>
        </div>
      </div>

      <div className="container-app">
        <div className="relative z-10 -mt-[72px] h-[104px] w-[104px] overflow-hidden rounded-[28px] border-4 border-white bg-white shadow-lg">
          {r.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logoUrl} alt={`${r.displayName} logo`} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center bg-brand-500 text-4xl font-black text-white">{r.displayName[0]}</div>
          )}
        </div>
        <h1 className="mt-3 flex items-center gap-2 text-[28px] font-black leading-tight tracking-tight">
          {r.displayName}
          {r.verificationStatus === "APPROVED" && <VerifiedBadge className="[&_svg]:h-6 [&_svg]:w-6" />}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] text-ink-muted">
          {r.cuisine && (
            <span className="inline-flex items-center gap-1.5">
              <UtensilsCrossed className="h-4 w-4 text-brand-500" /> {r.cuisine}
            </span>
          )}
          {(r.area || r.city) && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {[r.area, r.city].filter(Boolean).join(", ")}
            </span>
          )}
          {open !== null && <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${open ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-ink-muted"}`}>{open ? t("Open now") : t("Closed now")}</span>}
        </div>
        {r.description && <p className="mt-2 line-clamp-2 text-[15px] text-ink-muted">{r.description}</p>}

        {/* Stats */}
        <div className="mt-4 grid grid-cols-4 divide-x divide-brand-100 rounded-2xl bg-brand-50/70 py-3.5 ring-1 ring-brand-100 rtl:divide-x-reverse">
          {stats.map((st) => (
            <a key={st.label} href={st.href} className="flex flex-col items-center gap-1 px-1 text-center">
              {st.icon}
              <span className="tabular text-2xl font-black leading-none">{st.value}</span>
              <span className="text-xs text-ink-muted">{st.label}</span>
            </a>
          ))}
        </div>

        {/* Deliver to + order */}
        {(r.deliveryEnabled || r.pickupEnabled) && (
          <div className={`mt-3 ${card} p-3`}>
            <div className="flex items-center gap-3">
              {r.deliveryEnabled ? <DeliverToButton label={loc?.label ?? null} /> : <span className="flex-1 font-semibold">{t("Pickup only")}</span>}
              {r.orderingEnabled && (
                <a href="#menu" className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-brand-500 px-5 font-bold text-white shadow-lg shadow-brand-500/30 active:scale-[0.98]">
                  <Bike className="h-5 w-5" /> {t("Order now")}
                </a>
              )}
            </div>
            {deliveryLine && <p className={`mt-2 border-t border-black/5 pt-2 text-xs font-semibold ${deliveryLine.ok ? "text-emerald-700" : "text-amber-700"}`}>{deliveryLine.text}</p>}
          </div>
        )}
        {!r.orderingEnabled && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{t("Not taking online orders right now")}</p>}

        {/* Quick facts */}
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <div className={`${card} flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-2.5`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500">
              <Bike className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight">{t("Delivery")}</span>
              <span className="block text-xs text-ink-muted">{r.deliveryEnabled ? t("{a}–{b} min", { a: prep + 10, b: prep + 20 }) : t("Not available")}</span>
            </span>
          </div>
          <div className={`${card} flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-2.5`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight">{t("Pick up")}</span>
              <span className="block text-xs text-ink-muted">{r.pickupEnabled ? t("Ready in {n} min", { n: prep }) : t("Not available")}</span>
            </span>
          </div>
          <a href="#about" className={`${card} relative flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-2.5`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500">
              <Clock className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 text-sm font-bold leading-tight">{t("Hours & Contact")}</span>
            <ChevronRight className="absolute end-2 top-3 h-4 w-4 shrink-0 text-ink-muted rtl:-scale-x-100 sm:static" />
          </a>
        </div>
      </div>

      <div className="mt-4">
        <ProfileTabs slug={r.slug} sections={sections} reels={reels} orderingEnabled={r.orderingEnabled} about={about} reviews={reviewsTab} />
      </div>
    </main>
  );
}
