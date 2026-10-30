import Link from "next/link";
import type { ReelPerf } from "@/server/insights";
import { DailyChart } from "./daily-chart";
import { Section } from "./page";
import { StatCard } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { cn, compactNumber } from "@/lib/utils";

type Props = {
  reelId: string;
  currency: string;
  rangeLabel: string;
  days: number | "all" | null;
  data: { reel: ReelPerf | null; days: { date: string; views: number; opens: number; addToCarts: number; orders: number; revenueCents: number }[]; rank: number; reelCount: number; average: { views: number; orders: number; likes: number } };
};

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
const vsAvg = (v: number, avg: number) => (avg > 0 ? `${(v / avg).toFixed(1)}× your reel average` : "");

/** How one reel performs in a period: reach, engagement, the view → order funnel and attributed sales. */
export function ReelPerformance({ reelId, currency, rangeLabel, days, data }: Props) {
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
      title="Performance"
      description={rangeLabel}
      actions={
        <div className="flex gap-1.5">
          {([7, 30, 90, "all"] as const).map((d) => (
            <Link key={d} href={`/dashboard/reels/${reelId}?days=${d}`} className={cn("chip h-8 text-xs", days === d && "chip-active")}>
              {d === "all" ? "All time" : `${d} days`}
            </Link>
          ))}
        </div>
      }
    >
      {!r ? (
        <p className="text-sm text-ink-muted">No data yet.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Views" value={compactNumber(r.views)} sub={data.reelCount > 1 ? `#${data.rank} of ${data.reelCount} reels · ${vsAvg(r.views, data.average.views)}` : `${compactNumber(r.uniqueViewers)} unique viewers`} />
            <StatCard label="Unique viewers" value={compactNumber(r.uniqueViewers)} sub={r.avgWatchSec != null ? `avg. watch ${r.avgWatchSec}s` : undefined} />
            <StatCard label="Orders from this reel" value={r.orders} sub={`${r.completedOrders} completed · ${pct(r.orders, r.views)} of views`} tone="brand" />
            <StatCard label="Revenue from this reel" value={formatMoney(r.revenueCents, currency)} tone="green" sub="completed orders" />
            <StatCard label="Likes" value={compactNumber(r.likes)} sub={pct(r.likes, r.views) + " of views"} />
            <StatCard label="Shares" value={compactNumber(r.shares)} />
            <StatCard label="Dish opens" value={compactNumber(r.productOpens)} sub={pct(r.productOpens, r.views) + " of views"} />
            <StatCard label="Added to cart" value={compactNumber(r.addToCarts)} sub={pct(r.addToCarts, r.productOpens) + " of opens"} />
          </div>

          <div className="mb-5">
            <div className="mb-2 text-sm font-bold">From view to order</div>
            <div className="space-y-2">
              {funnel.map((f) => (
                <div key={f.label} className="grid grid-cols-[120px_1fr_88px] items-center gap-3 text-sm sm:grid-cols-[150px_1fr_110px]">
                  <span className="text-ink-soft">{f.label}</span>
                  <div className="h-6 overflow-hidden rounded-md bg-black/5">
                    <div className="h-full rounded-r-[4px] bg-brand-500" style={{ width: `${funnel[0].value ? Math.max(f.value ? 1.5 : 0, (f.value / funnel[0].value) * 100) : 0}%` }} />
                  </div>
                  <span className="tabular text-right">
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
