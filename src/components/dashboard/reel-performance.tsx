import Link from "next/link";
import type { ReelPerf } from "@/server/insights";
import { DailyChart } from "./daily-chart";
import { Section } from "./page";
import { StatCard } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { cn, compactNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";

type Props = {
  reelId: string;
  currency: string;
  rangeLabel: string;
  days: number | "all" | null;
  data: { reel: ReelPerf | null; days: { date: string; views: number; opens: number; addToCarts: number; orders: number; revenueCents: number }[]; rank: number; reelCount: number; average: { views: number; orders: number; likes: number } };
};

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

/** How one reel performs in a period: reach, engagement, the view → order funnel and attributed sales. */
export async function ReelPerformance({ reelId, currency, rangeLabel, days, data }: Props) {
  const t = await getT();
  const r = data.reel;
  const funnel = r
    ? [
        { label: "Views", value: r.views },
        { label: "Opened the dish", value: r.productOpens },
        { label: "Added to cart", value: r.addToCarts },
        { label: "Placed an order", value: r.orders },
      ]
    : [];
  return (
    <Section
      title={t("Performance")}
      description={rangeLabel}
      actions={
        <div className="flex gap-1.5">
          {([7, 30, 90, "all"] as const).map((d) => (
            <Link key={d} href={`/dashboard/reels/${reelId}?days=${d}`} className={cn("chip h-8 text-xs", days === d && "chip-active")}>
              {d === "all" ? t("All time") : t("{n} days", { n: d })}
            </Link>
          ))}
        </div>
      }
    >
      {!r ? (
        <p className="text-sm text-ink-muted">{t("No data yet.")}</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Views" value={compactNumber(r.views)} sub={data.reelCount > 1 ? `${t("#{rank} of {n} reels", { rank: data.rank, n: data.reelCount })} · ${data.average.views > 0 ? t("{x}× your reel average", { x: (r.views / data.average.views).toFixed(1) }) : ""}` : t("{n} unique viewers", { n: compactNumber(r.uniqueViewers) })} />
            <StatCard label="Unique viewers" value={compactNumber(r.uniqueViewers)} sub={r.avgWatchSec != null ? t("avg. watch {n}s", { n: r.avgWatchSec }) : undefined} />
            <StatCard label="Orders from this reel" value={r.orders} sub={t("{n} completed · {pct} of views", { n: r.completedOrders, pct: pct(r.orders, r.views) })} tone="brand" />
            <StatCard label="Revenue from this reel" value={formatMoney(r.revenueCents, currency)} tone="green" sub="completed orders" />
            <StatCard label="Likes" value={compactNumber(r.likes)} sub={t("{pct} of views", { pct: pct(r.likes, r.views) })} />
            <StatCard label="Shares" value={compactNumber(r.shares)} />
            <StatCard label="Dish opens" value={compactNumber(r.productOpens)} sub={t("{pct} of views", { pct: pct(r.productOpens, r.views) })} />
            <StatCard label="Added to cart" value={compactNumber(r.addToCarts)} sub={t("{pct} of opens", { pct: pct(r.addToCarts, r.productOpens) })} />
          </div>

          <div className="mb-5">
            <div className="mb-2 text-sm font-bold">{t("From view to order")}</div>
            <div className="space-y-2">
              {funnel.map((f) => (
                <div key={f.label} className="grid grid-cols-[120px_1fr_88px] items-center gap-3 text-sm sm:grid-cols-[150px_1fr_110px]">
                  <span className="text-ink-soft">{t(f.label)}</span>
                  <div className="h-6 overflow-hidden rounded-md bg-black/5">
                    <div className="h-full rounded-e-[4px] bg-brand-500" style={{ width: `${funnel[0].value ? Math.max(f.value ? 1.5 : 0, (f.value / funnel[0].value) * 100) : 0}%` }} />
                  </div>
                  <span className="tabular text-end">
                    <b>{compactNumber(f.value)}</b> <span className="text-xs text-ink-muted">{f.label === "Views" ? "" : pct(f.value, funnel[0].value)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <DailyChart
            days={data.days}
            currency={currency}
            metrics={[
              { key: "views", label: "Views" },
              { key: "opens", label: "Dish opens" },
              { key: "orders", label: "Orders" },
              { key: "revenueCents", label: "Revenue", money: true },
            ]}
          />
        </>
      )}
    </Section>
  );
}
