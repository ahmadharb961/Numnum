import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { outstanding } from "@/server/billing";
import { DashPage, Section } from "@/components/dashboard/page";
import { ActionButton } from "@/components/admin/action-button";
import { RestaurantAdminForm } from "@/components/admin/restaurant-admin-form";
import { AdjustmentForm } from "@/components/admin/adjustment-form";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { Badge, StatCard } from "@/components/ui/misc";
import { setRestaurantStatusAction, revokeVerificationAction } from "@/actions/admin";
import { formatMoney, formatRate } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { compactNumber, formatDate, formatDateTime, periodLabel } from "@/lib/utils";

export const metadata = { title: "Restaurant" };

export default async function AdminRestaurant({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const r = await prisma.restaurant.findUnique({
    where: { id },
    include: { staff: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { menuItems: { where: { archived: false } }, reels: true, orders: true } } },
  });
  if (!r) notFound();
  const [settings, invoices, accrued, recentOrders, reports, audits] = await Promise.all([
    getSettings(),
    prisma.invoice.findMany({ where: { restaurantId: id }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.commissionEvent.aggregate({ where: { restaurantId: id, status: "ACCRUED", invoiceId: null }, _sum: { commissionCents: true }, _count: true }),
    prisma.order.findMany({ where: { restaurantId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, reference: true, status: true, subtotalCents: true, currency: true, createdAt: true, suspicious: true } }),
    prisma.report.count({ where: { targetType: "RESTAURANT", targetId: id, status: "OPEN" } }),
    prisma.auditLog.findMany({ where: { entityType: "restaurant", entityId: id }, orderBy: { createdAt: "desc" }, take: 15, include: { actor: { select: { name: true } } } }),
  ]);
  const owed = invoices.reduce((s, i) => s + outstanding(i), 0);
  return (
    <DashPage
      title={r.displayName}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {r.businessName}
          <Badge tone={r.status === "ACTIVE" ? "green" : r.status === "SUSPENDED" ? "red" : "amber"}>{r.status.toLowerCase()}</Badge>
          <Badge tone={r.verificationStatus === "APPROVED" ? "blue" : "gray"}>{r.verificationStatus.toLowerCase()}</Badge>
          {reports > 0 && <Badge tone="red">{reports} open reports</Badge>}
        </span>
      }
      actions={
        <>
          <Link href={`/r/${r.slug}`} target="_blank" className="chip h-9 text-xs">
            Public profile
          </Link>
          {r.status !== "ACTIVE" && (
            <ActionButton variant="primary" action={setRestaurantStatusAction.bind(null, r.id, "ACTIVE")} confirm={`Approve and publish ${r.displayName}?`}>
              {r.status === "SUSPENDED" ? "Reactivate" : "Approve & publish"}
            </ActionButton>
          )}
          {r.status === "ACTIVE" && (
            <ActionButton variant="danger" action={setRestaurantStatusAction.bind(null, r.id, "SUSPENDED")} prompt="Reason for suspension (shown to the restaurant)">
              Suspend
            </ActionButton>
          )}
          {r.verificationStatus === "APPROVED" && (
            <ActionButton action={revokeVerificationAction.bind(null, r.id)} prompt="Why revoke the verified badge?">
              Revoke badge
            </ActionButton>
          )}
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Menu items" value={r._count.menuItems} />
        <StatCard label="Reels" value={r._count.reels} sub={`${compactNumber(r.totalReelViews)} views`} />
        <StatCard label="Order requests" value={r._count.orders} />
        <StatCard label="Accrued commission" value={formatMoney(accrued._sum.commissionCents ?? 0)} sub={`${accrued._count} entries`} />
        <StatCard label="Outstanding" value={formatMoney(owed)} tone={owed ? "red" : undefined} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Business">
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
            <dt className="text-ink-muted">Ordering</dt>
            <dd>{r.orderingEnabled ? "Accepting orders" : "Paused"} · prep ~{r.avgPrepMinutes} min · {r.deliveryEnabled ? `delivery ${r.deliveryFeeCents != null ? `(${(r.deliveryFeeCents / 100).toFixed(2)} ${r.currency})` : ""}` : "no delivery"}{r.pickupEnabled ? " · pickup" : ""}</dd>
            <dt className="text-ink-muted">Phone</dt>
            <dd>{r.phone ? formatPhone(r.phone) : "—"}</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd>{r.email ?? "—"}</dd>
            <dt className="text-ink-muted">Address</dt>
            <dd>{[r.address, r.area, r.city].filter(Boolean).join(", ") || "—"}</dd>
            <dt className="text-ink-muted">Agreement</dt>
            <dd>{r.agreementAcceptedAt ? `v${r.agreementVersion} · ${formatDateTime(r.agreementAcceptedAt)}` : "Not accepted"}</dd>
            <dt className="text-ink-muted">Commission</dt>
            <dd>{formatRate(r.commissionRateBps ?? settings.defaultCommissionRateBps)} {r.commissionRateBps == null && <span className="text-ink-muted">(default)</span>}</dd>
            <dt className="text-ink-muted">Staff</dt>
            <dd>
              {r.staff.map((s) => (
                <div key={s.id}>
                  {s.user.name} · {s.user.email} <Badge>{s.role.toLowerCase()}</Badge>
                </div>
              ))}
            </dd>
          </dl>
        </Section>
        <Section title="Controls">
          <RestaurantAdminForm id={r.id} commissionRate={r.commissionRateBps != null ? String(r.commissionRateBps / 100) : ""} restrictReels={r.restrictReels} restrictPromotion={r.restrictPromotion} orderingEnabled={r.orderingEnabled} />
        </Section>
      </div>
      <Section title="Invoices">
        {invoices.length ? (
          <table className="table-app">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Period</th>
                <th>Total</th>
                <th>Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/admin/invoices/${i.id}`} className="font-mono text-xs font-semibold text-brand-600">
                      {i.number}
                    </Link>
                  </td>
                  <td>{periodLabel(i.period)}</td>
                  <td>{formatMoney(i.totalDueCents)}</td>
                  <td>{formatMoney(outstanding(i))}</td>
                  <td>
                    <StatusBadge status={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-ink-muted">No invoices.</p>
        )}
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Commission adjustment" description="Negative amounts are credits to the restaurant. Approved adjustments roll into the next invoice.">
          <AdjustmentForm restaurantId={r.id} />
        </Section>
        <Section title="Recent order requests">
          <ul className="divide-y divide-black/5 text-sm">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex justify-between gap-2 py-2">
                <Link href={`/admin/orders?q=${o.reference}`} className="font-mono text-xs text-brand-600">
                  {o.reference}
                </Link>
                <span className="text-xs text-ink-muted">{formatDate(o.createdAt)}</span>
                <span>{formatMoney(o.subtotalCents, o.currency)}</span>
                <Badge tone={o.suspicious ? "red" : "gray"}>{o.status.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title="Audit trail">
        <ul className="space-y-1 text-xs">
          {audits.map((a) => (
            <li key={a.id}>
              <span className="text-ink-muted">{formatDateTime(a.createdAt)}</span> · <b>{a.action}</b> by {a.actor?.name ?? "system"}
            </li>
          ))}
        </ul>
      </Section>
    </DashPage>
  );
}
