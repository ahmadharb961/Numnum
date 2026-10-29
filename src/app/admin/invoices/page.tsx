import Link from "next/link";
import { prisma } from "@/server/db";
import { outstanding } from "@/server/billing";
import { DashPage } from "@/components/dashboard/page";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { formatMoney } from "@/lib/money";
import { cn, formatDate, periodLabel } from "@/lib/utils";

export const metadata = { title: "Invoices" };

const STATUSES = ["", "AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PARTIALLY_PAID", "OVERDUE", "DISPUTED", "PAID"];

export default async function AdminInvoices({ searchParams }: { searchParams: Promise<{ status?: string; period?: string }> }) {
  const sp = await searchParams;
  const invoices = await prisma.invoice.findMany({
    where: { ...(sp.status ? { status: sp.status as never } : {}), ...(sp.period ? { period: sp.period } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { restaurant: { select: { displayName: true } } },
  });
  return (
    <DashPage title="Invoices">
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/invoices${s ? `?status=${s}` : ""}`} className={cn("chip h-9 text-xs", (sp.status ?? "") === s && "chip-active")}>
            {s ? s.toLowerCase().replace(/_/g, " ") : "all"}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table-app">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Restaurant</th>
              <th>Period</th>
              <th>Orders</th>
              <th>Total</th>
              <th>Outstanding</th>
              <th>Due</th>
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
                <td>{i.restaurant.displayName}</td>
                <td className="whitespace-nowrap">{periodLabel(i.period)}</td>
                <td>{i.orderCount}</td>
                <td className="tabular">{formatMoney(i.totalDueCents)}</td>
                <td className="tabular font-semibold">{formatMoney(outstanding(i))}</td>
                <td className="whitespace-nowrap">{formatDate(i.dueDate)}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashPage>
  );
}
