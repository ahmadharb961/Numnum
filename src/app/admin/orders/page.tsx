import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { ActionButton } from "@/components/admin/action-button";
import { Badge } from "@/components/ui/misc";
import { adminOrderStatusAction, clearSuspiciousAction } from "@/actions/admin";
import { formatMoney } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Order records" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.OrderWhereInput = {
    ...(sp.f === "suspicious" ? { suspicious: true } : sp.f === "unacked" ? { acknowledgedAt: null, status: { in: ["LINK_GENERATED", "HANDOFF_ATTEMPTED"] } } : sp.f === "billable" ? { commission: { isNot: null } } : {}),
    ...(sp.q ? { OR: [{ reference: { contains: sp.q.toUpperCase() } }, { restaurantName: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [orders, total, funnel] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { commission: { select: { commissionCents: true, status: true } }, events: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true } } } }),
    prisma.order.count({ where }),
    Promise.all([prisma.order.count(), prisma.order.count({ where: { handoffAt: { not: null } } }), prisma.order.count({ where: { acknowledgedAt: { not: null } } }), prisma.order.count({ where: { acceptedAt: { not: null } } }), prisma.order.count({ where: { fulfilledAt: { not: null } } }), prisma.commissionEvent.count({ where: { status: { not: "VOIDED" } } })]),
  ]);
  const labels = ["Prepared requests", "WhatsApp handoffs", "Acknowledged", "Accepted", "Fulfilled", "Commissionable"];
  return (
    <DashPage title="Order records" description="Customer contact details are only shown to the receiving restaurant.">
      <div className="mb-5 grid grid-cols-3 gap-2 lg:grid-cols-6">
        {funnel.map((n, i) => (
          <div key={i} className="card p-3">
            <div className="text-[11px] font-semibold uppercase text-ink-muted">{labels[i]}</div>
            <div className="text-xl font-extrabold">{n}</div>
          </div>
        ))}
      </div>
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={sp.q} className="input h-10 max-w-xs text-sm" placeholder="Reference or restaurant" />
        {sp.f && <input type="hidden" name="f" value={sp.f} />}
      </form>
      <div className="mb-3 flex gap-2">
        {[
          ["", "All"],
          ["suspicious", "Suspicious"],
          ["unacked", "Unacknowledged"],
          ["billable", "Commissionable"],
        ].map(([k, l]) => (
          <Link key={k} href={`/admin/orders${k ? `?f=${k}` : ""}`} className={cn("chip h-9 text-xs", (sp.f ?? "") === k && "chip-active")}>
            {l}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table-app">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Restaurant</th>
              <th>Created</th>
              <th>Subtotal</th>
              <th>Status</th>
              <th>Handoffs</th>
              <th>Commission</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className={o.suspicious ? "bg-red-50/60" : ""}>
                <td className="font-mono text-xs">
                  {o.reference}
                  {o.suspicious && <div className="font-sans text-[11px] text-red-600">{o.suspiciousReason}</div>}
                  <details className="font-sans">
                    <summary className="cursor-pointer text-[11px] text-ink-muted">events</summary>
                    <ul className="text-[11px] text-ink-muted">
                      {o.events.map((e, i) => (
                        <li key={i}>
                          {formatDateTime(e.createdAt)} · {e.type}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td>
                  <Link href={`/admin/restaurants/${o.restaurantId}`} className="text-brand-600">
                    {o.restaurantName}
                  </Link>
                </td>
                <td className="whitespace-nowrap text-xs">{formatDateTime(o.createdAt)}</td>
                <td className="tabular">{formatMoney(o.subtotalCents, o.currency)}</td>
                <td>
                  <Badge>{o.status.toLowerCase().replace(/_/g, " ")}</Badge>
                </td>
                <td>{o.handoffCount}</td>
                <td className="text-xs">{o.commission ? `${formatMoney(o.commission.commissionCents)} · ${o.commission.status.toLowerCase()}` : "—"}</td>
                <td className="whitespace-nowrap">
                  {o.suspicious && <ActionButton action={clearSuspiciousAction.bind(null, o.id)}>Clear flag</ActionButton>}
                  {!["CANCELED", "DISPUTED"].includes(o.status) && (
                    <ActionButton variant="ghost" action={adminOrderStatusAction.bind(null, o.id, "CANCELED")} prompt="Why cancel this order record? (un-invoiced commission is voided)">
                      Cancel
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > page * 50 && (
        <div className="mt-4 text-center">
          <Link className="chip" href={`/admin/orders?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.f ? { f: sp.f } : {}), page: String(page + 1) })}`}>
            Next page
          </Link>
        </div>
      )}
    </DashPage>
  );
}
