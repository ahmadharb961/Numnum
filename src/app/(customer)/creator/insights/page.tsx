import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Heart, MousePointerClick, Send, ShoppingBag, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { creatorInsights, parseRange } from "@/server/insights";
import { PageHeader } from "@/components/customer/page-header";
import { DailyChart } from "@/components/dashboard/daily-chart";
import { formatMoney } from "@/lib/money";
import { cn, compactNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Insights"), robots: { index: false } };
}

/** A creator's numbers: big totals, the daily trend, then each reel. */
export default async function CreatorInsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const t = await getT();
  const me = await requireUser("/creator/insights");
  const c = await prisma.creator.findUnique({ where: { userId: me.id }, select: { id: true, status: true } });
  if (c?.status !== "APPROVED" && c?.status !== "SUSPENDED") redirect("/creator");
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const ins = await creatorInsights(c.id, parseRange({ days: String(days) }));
  const tiles = [
    { icon: Eye, value: compactNumber(ins.totals.views), label: t("views"), sub: t("{n} people", { n: compactNumber(ins.totals.uniqueViewers) }), tone: "text-brand-600 bg-brand-50" },
    { icon: ShoppingBag, value: String(ins.totals.orders), label: t("orders from your reels"), sub: t("{n} completed", { n: ins.totals.completedOrders }), tone: "text-emerald-700 bg-emerald-50" },
    { icon: Users, value: compactNumber(ins.totals.followers), label: t("followers"), sub: t("+{n} in this period", { n: ins.totals.newFollowers }), tone: "text-sky-700 bg-sky-50" },
    { icon: Heart, value: compactNumber(ins.totals.likes), label: t("likes"), sub: null, tone: "text-rose-600 bg-rose-50" },
    { icon: Send, value: compactNumber(ins.totals.shares), label: t("shares"), sub: null, tone: "text-violet-700 bg-violet-50" },
    { icon: MousePointerClick, value: compactNumber(ins.totals.dishOpens), label: t("dish opens"), sub: ins.totals.conversion != null ? t("{p} of views ordered", { p: `${(ins.totals.conversion * 100).toFixed(1)}%` }) : null, tone: "text-amber-700 bg-amber-50" },
  ];
  return (
    <div className="pb-nav">
      <PageHeader title="Insights" />
      <div className="container-app max-w-3xl space-y-5 py-5">
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/creator/insights?days=${d}`} className={cn("chip h-9 text-sm", days === d && "chip-active")}>
              {t("{n} days", { n: d })}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="creator-tiles">
          {tiles.map(({ icon: Icon, value, label, sub, tone }) => (
            <div key={label} className="card p-4">
              <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone)}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="mt-2 text-3xl font-black tabular tracking-tight">{value}</div>
              <div className="text-sm font-semibold">{label}</div>
              {sub && <div className="text-xs text-ink-muted">{sub}</div>}
            </div>
          ))}
        </div>
        {!!ins.revenue.length && (
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
            <span className="text-sm text-ink-muted">{t("Sales your reels brought to restaurants")}</span>
            {ins.revenue.map((r) => (
              <span key={r.currency} className="text-2xl font-black tabular text-emerald-700">
                {formatMoney(r.cents, r.currency)}
              </span>
            ))}
          </div>
        )}
        <div className="card p-4">
          <DailyChart days={ins.days} currency="USD" metrics={[{ key: "views", label: t("Views") }, { key: "orders", label: t("Orders") }]} />
        </div>
        <section>
          <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wide text-ink-muted">{t("Your reels")}</h2>
          {ins.reels.length ? (
            <ul className="card divide-y divide-black/5" data-testid="creator-reel-stats">
              {ins.reels.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-3">
                  <Link href={`/reel/${r.id}`} className="h-20 w-[45px] shrink-0 overflow-hidden rounded-lg bg-black">
                    {r.posterUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{r.name}</div>
                    <div className="truncate text-xs text-ink-muted">{r.restaurantName}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-soft">
                      <span>{t("{n} views", { n: compactNumber(r.views) })}</span>
                      <span>{t("{n} likes", { n: compactNumber(r.likes) })}</span>
                      {r.avgWatchSec != null && <span>{t("{n}s watched on average", { n: r.avgWatchSec })}</span>}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-xl font-black tabular text-emerald-700">{r.orders}</div>
                    <div className="text-[11px] text-ink-muted">{t("orders")}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="card p-6 text-center text-ink-muted">{t("Your live reels' numbers show here.")}</div>
          )}
        </section>
      </div>
    </div>
  );
}
