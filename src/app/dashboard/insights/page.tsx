import Link from "next/link";
import { Download, Eye, FileText, Film } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { parseRange, restaurantInsights } from "@/server/insights";
import { DashPage, Section } from "@/components/dashboard/page";
import { DailyChart } from "@/components/dashboard/daily-chart";
import { StatCard, EmptyState, Badge } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { STATUS_META } from "@/lib/order-status";
import { cn, compactNumber, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const ctx = await requireRestaurant("MANAGER");
  const sp = await searchParams;
  const range = parseRange(sp);
  const ins = await restaurantInsights(ctx.restaurant.id, range);
  const k = ins.kpis;
  const cur = ins.restaurant.currency;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const isPreset = (d: number) => !sp.from && (Number(sp.days) || 30) === d;
  return (
    <DashPage
      title="Insights"
      description={range.label}
      actions={
        <>
          <a href={`/api/dashboard/insights/pdf?${qs}`} className={buttonClass("primary", "sm")}>
            <FileText className="h-4 w-4" /> Export PDF
          </a>
          <a href={`/api/dashboard/insights/orders?${qs}`} className={buttonClass("outline", "sm")}>
            <Download className="h-4 w-4" /> Orders CSV
          </a>
        </>
      }
    >
      <form className="mb-5 flex flex-wrap items-end gap-2">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/dashboard/insights?days=${d}`} className={cn("chip h-9 text-xs", isPreset(d) && "chip-active")}>
            {d} days
          </Link>
        ))}
        <label className="text-xs font-semibold text-ink-muted">
          From
          <input type="date" name="from" defaultValue={sp.from} className="input mt-1 h-9 w-36 text-sm" />
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          To
          <input type="date" name="to" defaultValue={sp.to} className="input mt-1 h-9 w-36 text-sm" />
        </label>
        <button className="chip h-9 text-xs">Apply</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue (completed)" value={formatMoney(k.revenueCents, cur)} tone="green" sub={`Avg. order ${formatMoney(k.avgOrderCents, cur)}`} />
        <StatCard label="Orders" value={k.ordersPlaced} sub={`${k.ordersCompleted} completed · ${k.ordersRejected} rejected · ${k.ordersCanceled} canceled${k.ordersFailed ? ` · ${k.ordersFailed} failed` : ""}`} />
        <StatCard label="Profile visits" value={compactNumber(k.profileVisits)} sub={`${compactNumber(k.uniqueVisitors)} unique visitors`} />
        <StatCard label="Reel views" value={compactNumber(k.reelViews)} sub={`${compactNumber(k.dishViews)} dish views · ${compactNumber(k.addToCarts)} add to cart`} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Visit → order" value={k.conversion != null ? `${(k.conversion * 100).toFixed(1)}%` : "—"} sub="orders per profile visit" />
        <StatCard label="Item sales" value={formatMoney(k.itemSalesCents, cur)} sub={`+ ${formatMoney(k.deliveryFeesCents, cur)} delivery fees`} />
        <StatCard label="Commission" value={formatMoney(k.commissionCents)} sub="on completed orders" />
        <StatCard label="Rating" value={ins.restaurant.ratingCount ? `${ins.restaurant.ratingAvg.toFixed(1)} ★` : "—"} sub={`${ins.restaurant.ratingCount} reviews`} />
      </div>

      <Section title="Daily trend">
        <DailyChart days={ins.days} currency={cur} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Top-selling items" description="By quantity in completed orders">
          {ins.topItems.length ? (
            <ol className="space-y-2.5 text-sm">
              {ins.topItems.map((t, i) => {
                const max = ins.topItems[0].quantity || 1;
                return (
                  <li key={t.name + i}>
                    <div className="flex justify-between gap-2">
                      <span>
                        <span className="mr-2 text-ink-muted">{i + 1}.</span>
                        {t.name}
                      </span>
                      <span className="tabular font-semibold">
                        {t.quantity} sold · {formatMoney(t.salesCents, cur)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(t.quantity / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState title="No completed orders in this period" />
          )}
        </Section>
        <Section title="Most viewed reels">
          {ins.topReels.length ? (
            <ul className="space-y-2.5">
              {ins.topReels.map((r, i) => (
                <li key={r.id}>
                  <Link href={`/dashboard/reels/${r.id}`} className="flex items-center gap-3 text-sm">
                    <span className="w-4 text-ink-muted">{i + 1}</span>
                    <div className="h-14 w-9 shrink-0 overflow-hidden rounded bg-black">
                      {r.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.posterUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.menuItem.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Eye className="h-3.5 w-3.5" /> {compactNumber(r.views)}
                    </span>
                    <span className="text-xs text-ink-muted">{r.orderInits} orders</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Film />} title="No reel views in this period" />
          )}
        </Section>
      </div>

      <Section title="Reels performance" description="Every reel in this period — tap one for its full report">
        {ins.reels.length ? (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="table-app">
              <thead>
                <tr>
                  <th>Reel</th>
                  <th>Views</th>
                  <th>Unique</th>
                  <th>Avg. watch</th>
                  <th>Likes</th>
                  <th>Shares</th>
                  <th>Dish opens</th>
                  <th>Add to cart</th>
                  <th>Orders</th>
                  <th>View → order</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {ins.reels.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/dashboard/reels/${r.id}?days=${sp.days ?? 30}`} className="flex items-center gap-2 font-semibold text-brand-600">
                        <span className="h-10 w-7 shrink-0 overflow-hidden rounded bg-black">
                          {r.posterUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.posterUrl} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="max-w-[160px] truncate">{r.name}</span>
                        {r.visibility !== "PUBLISHED" && <Badge>{r.visibility.toLowerCase()}</Badge>}
                      </Link>
                    </td>
                    <td className="tabular font-semibold">{compactNumber(r.views)}</td>
                    <td className="tabular">{compactNumber(r.uniqueViewers)}</td>
                    <td className="tabular">{r.avgWatchSec != null ? `${r.avgWatchSec}s` : "—"}</td>
                    <td className="tabular">{compactNumber(r.likes)}</td>
                    <td className="tabular">{compactNumber(r.shares)}</td>
                    <td className="tabular">{compactNumber(r.productOpens)}</td>
                    <td className="tabular">{compactNumber(r.addToCarts)}</td>
                    <td className="tabular font-semibold">{r.orders}</td>
                    <td className="tabular">{r.conversion != null ? `${(r.conversion * 100).toFixed(1)}%` : "—"}</td>
                    <td className="tabular">{formatMoney(r.revenueCents, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Film />} title="No published reels yet" />
        )}
      </Section>

      <Section title="Order history" description={`${ins.orders.length} orders in this period`}>
        {ins.orders.length ? (
          <div className="-mx-4 max-h-[520px] overflow-auto sm:mx-0">
            <table className="table-app">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ins.orders.slice(0, 300).map((o) => (
                  <tr key={o.reference}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(o.createdAt)}</td>
                    <td className="font-mono text-xs">
                      <Link href={`/dashboard/orders?ref=${o.reference}`} className="text-brand-600">
                        {o.reference}
                      </Link>
                    </td>
                    <td>{o.customer}</td>
                    <td className="text-xs">{o.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}</td>
                    <td className="tabular">{o.items}</td>
                    <td className="tabular font-semibold">{formatMoney(o.totalCents, cur)}</td>
                    <td>
                      <Badge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ins.orders.length > 300 && <p className="p-3 text-center text-xs text-ink-muted">Showing the latest 300 — export the CSV for all {ins.orders.length}.</p>}
          </div>
        ) : (
          <EmptyState title="No orders in this period" />
        )}
      </Section>
    </DashPage>
  );
}
