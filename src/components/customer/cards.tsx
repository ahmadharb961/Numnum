import Link from "next/link";
import { Eye, MapPin, Play } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { compactNumber, cn } from "@/lib/utils";
import { RatingPill, VerifiedBadge, Badge } from "@/components/ui/misc";
import { isOpenAt, type OpeningHours } from "@/lib/hours";

export function DishCard({ item }: { item: { id: string; name: string; description: string | null; priceCents: number; currency: string; ratingAvg: number; ratingCount: number; available: boolean; image: { url: string; thumbUrl: string | null } | null; restaurant?: { slug: string; displayName: string; verificationStatus: string } } }) {
  return (
    <Link href={`/item/${item.id}`} className="card flex gap-3 p-2.5 active:scale-[0.99]">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black/5">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image.thumbUrl ?? item.image.url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-3xl">🍽️</div>
        )}
        {!item.available && <div className="absolute inset-0 grid place-items-center bg-white/70 text-[11px] font-bold text-ink-soft">Unavailable</div>}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="line-clamp-1 font-bold">{item.name}</div>
        {item.restaurant && (
          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-ink-muted">
            <span className="truncate">{item.restaurant.displayName}</span>
            {item.restaurant.verificationStatus === "APPROVED" && <VerifiedBadge />}
          </div>
        )}
        {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{item.description}</p>}
        <div className="mt-1.5 flex items-center justify-between">
          <span className="tabular font-extrabold text-brand-600">{formatMoney(item.priceCents, item.currency)}</span>
          <RatingPill avg={item.ratingAvg} count={item.ratingCount} />
        </div>
      </div>
    </Link>
  );
}

export function RestaurantCard({ r }: { r: { slug: string; displayName: string; logoUrl: string | null; coverUrl: string | null; cuisine: string | null; area: string | null; city: string | null; verificationStatus: string; ratingAvg: number; ratingCount: number; deliveryEnabled: boolean; pickupEnabled: boolean; openingHours: unknown; _count?: { menuItems: number } } }) {
  const open = isOpenAt(r.openingHours as OpeningHours);
  return (
    <Link href={`/r/${r.slug}`} className="card block overflow-hidden active:scale-[0.99]">
      <div className="relative h-28 bg-gradient-to-br from-brand-100 to-brand-200">
        {r.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        {open !== null && <Badge tone={open ? "green" : "gray"} className="absolute right-2 top-2 bg-white/95">{open ? "Open now" : "Closed"}</Badge>}
      </div>
      <div className="flex items-start gap-3 p-3">
        <div className="-mt-9 h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-[3px] border-white bg-white shadow">
          {r.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center bg-brand-500 text-xl font-black text-white">{r.displayName[0]}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-bold">
            <span className="truncate">{r.displayName}</span>
            {r.verificationStatus === "APPROVED" && <VerifiedBadge />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            {r.cuisine && <span>{r.cuisine}</span>}
            {(r.area || r.city) && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {r.area || r.city}
              </span>
            )}
            <RatingPill avg={r.ratingAvg} count={r.ratingCount} />
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {r.deliveryEnabled && <Badge tone="brand">Delivery</Badge>}
            {r.pickupEnabled && <Badge>Pickup</Badge>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ReelThumb({ href, posterUrl, views, className, label }: { href: string; posterUrl: string | null; views: number; className?: string; label?: string }) {
  return (
    <Link href={href} className={cn("relative block aspect-[9/16] overflow-hidden bg-black", className)}>
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt={label ?? ""} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="grid h-full place-items-center text-white/50">
          <Play className="h-6 w-6" />
        </div>
      )}
      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 text-xs font-bold text-white text-shadow">
        <Eye className="h-3.5 w-3.5" />
        {compactNumber(views)}
      </span>
    </Link>
  );
}
