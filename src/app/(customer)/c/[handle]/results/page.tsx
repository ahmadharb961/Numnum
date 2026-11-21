import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "@/components/link";
import { BadgeCheck, Eye, Instagram, ShieldCheck, ShoppingBag, Store, UserRound } from "lucide-react";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { handleRedirect } from "@/server/creators";
import { creatorResults } from "@/server/creator-results";
import { PageHeader } from "@/components/customer/page-header";
import { ShareButton } from "@/components/customer/restaurant-profile";
import { formatMoney } from "@/lib/money";
import { compactNumber, formatDate } from "@/lib/utils";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

async function load(handle: string) {
  return prisma.creator.findFirst({ where: { handle: handle.toLowerCase(), status: "APPROVED" } });
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const t = await getT();
  const c = await load((await params).handle);
  if (!c || !c.shareResults) return { title: "numnum", robots: { index: false } };
  const r = await creatorResults(c.id);
  const title = t("{name}'s results on numnum", { name: c.displayName });
  const description = t(r.totals.completedOrders === 1 ? "1 order from their food reels, counted by numnum." : "{n} orders from their food reels, counted by numnum.", { n: r.totals.completedOrders });
  return { title, description, openGraph: { title, description, images: c.avatarUrl ? [c.avatarUrl] : undefined } };
}

/**
 * A creator's results, shown only if they chose to: orders their reels really brought (counted by
 * numnum from placed orders), so a restaurant can trust them before paying them to tag a dish.
 */
export default async function CreatorResultsPage({ params }: { params: Promise<{ handle: string }> }) {
  const [{ handle }, t, lang, me] = await Promise.all([params, getT(), getLocale(), getCurrentUser()]);
  const c = await load(handle);
  if (!c) {
    const moved = await handleRedirect(handle);
    if (moved) permanentRedirect(`/c/${moved}/results`);
    notFound();
  }
  const self = me?.id === c.userId;
  if (!c.shareResults && !self) notFound();
  const r = await creatorResults(c.id);
  const ig = c.instagram ? (/^https?:\/\//.test(c.instagram) ? c.instagram : `https://instagram.com/${c.instagram.replace(/^@/, "")}`) : null;
  const big = [
    { icon: ShoppingBag, value: compactNumber(r.totals.completedOrders), label: t("completed orders from their reels"), tone: "bg-emerald-50 text-emerald-700" },
    { icon: Eye, value: compactNumber(r.totals.views), label: t("reel views"), tone: "bg-brand-50 text-brand-600" },
    { icon: ShieldCheck, value: r.totals.ordersPer1000Views != null ? String(r.totals.ordersPer1000Views) : "–", label: t("orders per 1,000 views"), tone: "bg-sky-50 text-sky-700" },
    { icon: Store, value: String(r.totals.restaurants), label: t(r.totals.restaurants === 1 ? "restaurant worked with" : "restaurants worked with"), tone: "bg-violet-50 text-violet-700" },
  ];
  return (
    <main className="pb-nav">
      <PageHeader
        title={t("Results")}
        right={
          <ShareButton title={t("{name}'s results on numnum", { name: c.displayName })} message={t("{name}'s results on numnum: {n} orders from their food reels.", { name: c.displayName, n: r.totals.completedOrders })} path={`/c/${c.handle}/results`} className="chip h-9 text-sm font-bold">
            {t("Share")}
          </ShareButton>
        }
      />
      <div className="container-app max-w-3xl space-y-4 py-5" data-testid="creator-results">
        {self && !c.shareResults && <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{t("Only you can see this page. Turn on “Show my results to restaurants” in Insights to share it.")}</p>}
        <section className="card flex items-center gap-4 p-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
            {c.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-8 w-8" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-xl font-black">
              {c.displayName}
              {c.verification === "APPROVED" && <BadgeCheck className="h-5 w-5 text-sky-500" aria-label={t("Verified")} />}
            </h1>
            <div className="text-sm text-ink-muted" dir="ltr">@{c.handle}</div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              <Link href={`/c/${c.handle}`} className="font-semibold text-brand-600">{t("Profile and reels")}</Link>
              {ig && (
                <a href={ig} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 font-semibold text-brand-600">
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              )}
            </div>
          </div>
        </section>

        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" data-testid="results-verified">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          {t("Counted by numnum from real orders placed from this creator's reels, since {date}. Updated every few minutes.", { date: formatDate(r.since, { dateStyle: "medium" }, lang) })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {big.map(({ icon: Icon, value, label, tone }) => (
            <div key={label} className="card p-4">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="mt-2 text-3xl font-black tabular tracking-tight">{value}</div>
              <div className="text-sm font-semibold">{label}</div>
            </div>
          ))}
        </div>
        <div className="card grid grid-cols-3 divide-x divide-black/5 p-3 text-center rtl:divide-x-reverse">
          <div>
            <div className="text-lg font-black tabular">{formatMoney(r.totals.salesUsdCents, "USD")}</div>
            <div className="text-xs text-ink-muted">{t("food sales for restaurants")}</div>
          </div>
          <div>
            <div className="text-lg font-black tabular">{r.totals.avgOrderUsdCents != null ? formatMoney(r.totals.avgOrderUsdCents, "USD") : "–"}</div>
            <div className="text-xs text-ink-muted">{t("average order")}</div>
          </div>
          <div>
            <div className="text-lg font-black tabular">{compactNumber(r.totals.completedLast30)}</div>
            <div className="text-xs text-ink-muted">{t("orders in the last 30 days")}</div>
          </div>
        </div>

        <section>
          <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-ink-muted">{t("Restaurants they brought orders to")}</h2>
          {r.restaurants.length ? (
            <ul className="card divide-y divide-black/5" data-testid="results-restaurants">
              {r.restaurants.map((x) => (
                <li key={x.slug} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <Link href={`/r/${x.slug}`} className="truncate font-bold">{x.name}</Link>
                    <div className="text-xs text-ink-muted">{t("{r} reels · {v} views", { r: x.reels, v: compactNumber(x.views) })}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-xl font-black tabular text-emerald-700">{x.completed}</div>
                    <div className="text-[11px] text-ink-muted">{t("orders")}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="card p-6 text-center text-ink-muted">{t("No orders yet.")}</div>
          )}
        </section>

        {r.topReels.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-ink-muted">{t("Reels that sold the most")}</h2>
            <div className="grid grid-cols-3 gap-1.5" data-testid="results-top-reels">
              {r.topReels.map((x) => {
                const tile = (
                  <>
                    {x.posterUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-8 text-white">
                      <span className="block truncate text-xs font-bold">{x.name}</span>
                      <span className="block text-[11px] font-semibold text-emerald-300">{t("{n} orders", { n: x.completed })}</span>
                    </span>
                  </>
                );
                return x.visible ? (
                  <Link key={x.id} href={`/c/${c.handle}/reels/${x.id}`} className="relative block aspect-[9/16] overflow-hidden rounded-xl bg-black">
                    {tile}
                  </Link>
                ) : (
                  <div key={x.id} className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black">
                    {tile}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
