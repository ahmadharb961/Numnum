import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { prisma } from "@/server/db";
import { ownerKey } from "@/server/engagement";
import { getCurrentUser } from "@/server/auth";
import { getMainImages } from "@/server/menu";
import { publicReelWhere } from "@/server/feed";
import { DishCard, ReelThumb, RestaurantCard } from "@/components/customer/cards";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { deviceId } from "@/server/request";
import { formatMoney } from "@/lib/money";
import { STATUS_META } from "@/lib/order-status";
import { MapPin, Receipt, UserRound } from "lucide-react";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Saved"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const t = await getT();
  const [key, user] = await Promise.all([ownerKey(), getCurrentUser()]);
  // Saves belong to an account.
  if (!user)
    return (
      <main className="pb-nav">
        <div className="container-app pt-16 text-center" style={{ paddingTop: "calc(var(--safe-top) + 64px)" }}>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-500">
            <Bookmark className="h-8 w-8 fill-brand-500" />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight">{t("Log in to see your saved food")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-ink-muted">{t("Save the dishes, reels and restaurants you love and find them here on any device.")}</p>
          <div className="mx-auto mt-6 grid max-w-xs gap-3">
            <Link href="/account/register?next=/saved" className={buttonClass("primary", "lg")}>
              {t("Create an account")}
            </Link>
            <Link href="/login?next=/saved" className={buttonClass("outline", "lg")}>
              {t("I already have an account")}
            </Link>
          </div>
        </div>
      </main>
    );
  const saved = key ? await prisma.savedItem.findMany({ where: { ownerKey: key }, orderBy: { createdAt: "desc" } }) : [];
  const ids = (t: string) => saved.filter((s) => s.type === t).map((s) => s.refId);
  const [reels, items, restaurants] = await Promise.all([
    prisma.reel.findMany({ where: { ...publicReelWhere, id: { in: ids("REEL") } }, select: { id: true, posterUrl: true, viewCount: true } }),
    prisma.menuItem.findMany({ where: { id: { in: ids("ITEM") }, archived: false }, include: { restaurant: { select: { slug: true, displayName: true, verificationStatus: true } } } }),
    prisma.restaurant.findMany({ where: { id: { in: ids("RESTAURANT") }, status: "ACTIVE" }, include: { _count: { select: { menuItems: true } } } }),
  ]);
  const images = await getMainImages(items.map((i) => i.id));
  const dev = await deviceId();
  const recentOrders = user
    ? await prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 3 })
    : dev
      ? await prisma.order.findMany({ where: { deviceKey: dev, userId: null }, orderBy: { createdAt: "desc" }, take: 5 })
      : [];
  const empty = !reels.length && !items.length && !restaurants.length;
  return (
    <main className="pb-nav">
      <header className="container-wide pb-2" style={{ paddingTop: "calc(var(--safe-top) + 14px)" }}>
        <h1 className="text-2xl font-black tracking-tight">{t("Saved")}</h1>
        {user && (
          <p className="mt-1 text-sm text-ink-muted">
            {t("Signed in as {name}", { name: user.name })} ·{" "}
            <Link href="/account" className="font-semibold text-brand-600">
              {t("Account")}
            </Link>
          </p>
        )}
      </header>
      <div className="container-wide space-y-6 pt-2">
        {user && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { href: "/account/orders", icon: Receipt, label: "Orders" },
              { href: "/account/addresses", icon: MapPin, label: "Addresses" },
              { href: "/account", icon: UserRound, label: "Account" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="card flex flex-col items-center gap-1 py-3 text-xs font-semibold">
                <l.icon className="h-5 w-5 text-brand-600" />
                {t(l.label)}
              </Link>
            ))}
          </div>
        )}
        {recentOrders.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">{user ? t("Recent orders") : t("Your orders on this device")}</h2>
            <div className="space-y-2">
              {recentOrders.map((o) => (
                <Link key={o.id} href={`/order/${o.reference}`} className="card flex items-center justify-between gap-3 p-3.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{o.restaurantName}</span>
                    <Badge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Badge>
                  </span>
                  <span className="tabular font-semibold">{formatMoney(o.totalCents, o.currency)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {empty && <EmptyState icon={<Bookmark />} title={t("Nothing saved yet")} body={t("Tap the bookmark on reels or save restaurants to find them here.")} action={<Link href="/" className="chip chip-active">{t("Watch reels")}</Link>} />}
        {reels.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">{t("Reels")}</h2>
            <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl lg:grid-cols-5 lg:gap-2">
              {reels.map((r) => (
                <ReelThumb key={r.id} href={`/reel/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} />
              ))}
            </div>
          </section>
        )}
        {items.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">{t("Dishes")}</h2>
            <div className="grid gap-2.5 lg:grid-cols-2">
              {items.map((i) => (
                <DishCard key={i.id} item={{ ...i, image: images.get(i.id) ?? null }} />
              ))}
            </div>
          </section>
        )}
        {restaurants.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">{t("Restaurants")}</h2>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {restaurants.map((r) => (
                <RestaurantCard key={r.id} r={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
