import type { Metadata } from "next";
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
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Insights") };
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const t = await getT();
  const lang = await getLocale();
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
      title={t("Insights")}
      description={range.label}
      actions={
        <>
          <a href={`/api/dashboard/insights/pdf?${qs}`} className={buttonClass("primary", "sm")}>
            <FileText className="h-4 w-4" /> {t("Export PDF")}
          </a>
          <a href={`/api/dashboard/insights/orders?${qs}`} className={buttonClass("outline", "sm")}>
            <Download className="h-4 w-4" /> {t("Orders CSV")}
          </a>
        </>
      }
    >
      <form className="mb-5 flex flex-wrap items-end gap-2">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/dashboard/insights?days=${d}`} className={cn("chip h-9 text-xs", isPreset(d) && "chip-active")}>
            {t("{n} days", { n: d })}
          </Link>
        ))}
        <label className="text-xs font-semibold text-ink-muted">
          {t("From")}
          <input type="date" name="from" defaultValue={sp.from} className="input mt-1 h-9 w-36 text-sm" />
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          {t("To")}
          <input type="date" name="to" defaultValue={sp.to} className="input mt-1 h-9 w-36 text-sm" />
        </label>
        <button className="chip h-9 text-xs">{t("Apply")}</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue (completed)" value={formatMoney(k.revenueCents, cur)} tone="green" sub={`Avg. order ${formatMoney(k.avgOrderCents, cur)}`} />
        <StatCard label="Orders" value={k.ordersPlaced} sub={t("{completed} completed · {rejected} rejected · {canceled} canceled", { completed: k.ordersCompleted, rejected: k.ordersRejected, canceled: k.ordersCanceled }) + (k.ordersFailed ? ` · ${t("{n} failed", { n: k.ordersFailed })}` : "")} />
        <StatCard label="Profile visits" value={compactNumber(k.profileVisits)} sub={t("{n} unique visitors", { n: compactNumber(k.uniqueVisitors) })} />
        <StatCard label="Reel views" value={compactNumber(k.reelViews)} sub={t("{views} dish views · {carts} add to cart", { views: compactNumber(k.dishViews), carts: compactNumber(k.addToCarts) })} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Visit → order" value={k.conversion != null ? `${(k.conversion * 100).toFixed(1)}%` : "—"} sub="orders per profile visit" />
        <StatCard label="Item sales" value={formatMoney(k.itemSalesCents, cur)} sub={t("+ {amount} delivery fees", { amount: formatMoney(k.deliveryFeesCents, cur) })} />
        <StatCard label="Commission" value={formatMoney(k.commissionCents)} sub="on completed orders" />
        <StatCard label="Rating" value={ins.restaurant.ratingCount ? `${ins.restaurant.ratingAvg.toFixed(1)} ★` : "—"} sub={t("{n} reviews", { n: ins.restaurant.ratingCount })} />
      </div>

      <Section title={t("Daily trend")}>
        <DailyChart days={ins.days} currency={cur} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("Top-selling items")} description={t("By quantity in completed orders")}>
          {ins.topItems.length ? (
            <ol className="space-y-2.5 text-sm">
              {ins.topItems.map((t, i) => {
                const max = ins.topItems[0].quantity || 1;
                return (
                  <li key={t.name + i}>
                    <div className="flex justify-between gap-2">
                      <span>
                        <span className="me-2 text-ink-muted">{i + 1}.</span>
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
        <Section title={t("Most viewed reels")}>
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
            <EmptyState icon={<Film />} title={t("No reel views in this period")} />
          )}
        </Section>
      </div>

      <Section title={t("Reels performance")} description={t("Every reel in this period — tap one for its full report")}>
        {ins.reels.length ? (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="table-app">
              <thead>
                <tr>
                  <th>{t("Reel")}</th>
                  <th>{t("Views")}</th>
                  <th>{t("Unique")}</th>
                  <th>{t("Avg. watch")}</th>
                  <th>{t("Likes")}</th>
                  <th>{t("Shares")}</th>
                  <th>{t("Dish opens")}</th>
                  <th>{t("Add to cart")}</th>
                  <th>{t("Orders")}</th>
                  <th>{t("View → order")}</th>
                  <th>{t("Revenue")}</th>
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
          <EmptyState icon={<Film />} title={t("No published reels yet")} />
        )}
      </Section>

      <Section title={t("Order history")} description={t("{n} orders in this period", { n: ins.orders.length })}>
        {ins.orders.length ? (
          <div className="-mx-4 max-h-[520px] overflow-auto sm:mx-0">
            <table className="table-app">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Order")}</th>
                  <th>{t("Customer")}</th>
                  <th>{t("Type")}</th>
                  <th>{t("Items")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {ins.orders.slice(0, 300).map((o) => (
                  <tr key={o.reference}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(o.createdAt, lang)}</td>
                    <td className="font-mono text-xs">
                      <Link href={`/dashboard/orders?ref=${o.reference}`} className="text-brand-600">
                        {o.reference}
                      </Link>
                    </td>
                    <td>{o.customer}</td>
                    <td className="text-xs">{o.fulfillment === "DELIVERY" ? t("Delivery") : t("Pickup")}</td>
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
