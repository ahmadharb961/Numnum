import Link from "next/link";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { suspiciousRestaurants } from "@/server/analytics";
import { DashPage, Section } from "@/components/dashboard/page";
import { StatCard } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { compactNumber } from "@/lib/utils";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const settings = await getSettings();
  const [restaurants, active, verified, items, reels, views, orders30, completed, commissionable, accrued, invoiced, paid, openInvoices, overdue, suspicious] = await Promise.all([
    prisma.restaurant.count(),
    prisma.restaurant.count({ where: { status: "ACTIVE" } }),
    prisma.restaurant.count({ where: { verificationStatus: "APPROVED" } }),
    prisma.menuItem.count({ where: { archived: false } }),
    prisma.reel.count({ where: { visibility: "PUBLISHED" } }),
    prisma.reel.aggregate({ _sum: { viewCount: true } }),
    prisma.order.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
    prisma.order.count({ where: { status: "COMPLETED" } }),
    prisma.commissionEvent.aggregate({ where: { status: { not: "VOIDED" } }, _sum: { baseCents: true }, _count: true }),
    prisma.commissionEvent.aggregate({ where: { status: { in: ["ACCRUED", "DISPUTED"] } }, _sum: { commissionCents: true } }),
    prisma.invoice.aggregate({ _sum: { totalDueCents: true } }),
    prisma.payment.aggregate({ where: { status: "APPROVED" }, _sum: { verifiedAmountCents: true } }),
    prisma.invoice.findMany({ where: { status: { notIn: ["PAID", "DRAFT"] } }, select: { totalDueCents: true, paidCents: true } }),
    prisma.invoice.count({ where: { status: "OVERDUE" } }),
    suspiciousRestaurants(settings.suspiciousRejectRate),
  ]);
  const receivable = openInvoices.reduce((s, i) => s + Math.max(0, i.totalDueCents - i.paidCents), 0);
  return (
    <DashPage title="Platform overview">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">Marketplace</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Restaurants" value={restaurants} sub={`${active} active · ${verified} verified`} />
        <StatCard label="Menu items" value={compactNumber(items)} />
        <StatCard label="Published reels" value={compactNumber(reels)} />
        <StatCard label="Reel views" value={compactNumber(views._sum.viewCount ?? 0)} sub="qualified" />
        <StatCard label="Orders (30 days)" value={compactNumber(orders30)} />
      </div>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">Commercial outcomes</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completed orders" value={compactNumber(completed)} sub="cash collected by restaurants" />
        <StatCard label="Commissionable order volume" value={formatMoney(commissionable._sum.baseCents ?? 0)} sub={`${commissionable._count} orders`} />
        <StatCard label="Accrued (not invoiced)" value={formatMoney(accrued._sum.commissionCents ?? 0)} />
        <StatCard label="Total invoiced" value={formatMoney(invoiced._sum.totalDueCents ?? 0)} />
        <StatCard label="Verified payments" value={formatMoney(paid._sum.verifiedAmountCents ?? 0)} tone="green" />
        <StatCard label="Outstanding receivables" value={formatMoney(receivable)} tone={receivable ? "brand" : undefined} />
        <StatCard label="Overdue invoices" value={overdue} tone={overdue ? "red" : undefined} sub={<Link href="/admin/invoices?status=OVERDUE" className="text-brand-600">Review →</Link>} />
        <StatCard label="Default commission" value={`${settings.defaultCommissionRateBps / 100}%`} sub={`charged on ${settings.billableEvent === "COMPLETED" ? "completed" : "accepted"} orders`} />
      </div>
      <Section title="Suspicious activity" description={`Restaurants where ≥${Math.round(settings.suspiciousRejectRate * 100)}% of orders (last 30 days, min 5) were rejected or reported as not delivered, or where customers contradicted the restaurant 2+ times.`}>
        {suspicious.length ? (
          <table className="table-app">
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Orders</th>
                <th>Rejected</th>
                <th>Not delivered</th>
                <th>Customer disagrees</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {suspicious.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/admin/restaurants/${s.id}`} className="font-semibold text-brand-600">
                      {s.name}
                    </Link>
                  </td>
                  <td>{s.total}</td>
                  <td>{s.rejected}</td>
                  <td>{s.failed}</td>
                  <td className={s.contradicted ? "font-bold text-red-600" : ""}>{s.contradicted}</td>
                  <td className="font-bold text-red-600">{Math.round(s.rate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-ink-muted">Nothing unusual detected.</p>
        )}
      </Section>
    </DashPage>
  );
}
