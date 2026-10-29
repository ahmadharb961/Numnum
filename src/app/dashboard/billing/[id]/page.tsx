import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { outstanding } from "@/server/billing";
import { getSettings } from "@/server/settings";
import { DashPage, Section } from "@/components/dashboard/page";
import { PayWhishButton } from "@/components/dashboard/pay-whish";
import { DisputeButton } from "@/components/dashboard/dispute-button";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { buttonClass } from "@/components/ui/button";
import { formatMoney, formatRate } from "@/lib/money";
import { formatDate, periodLabel } from "@/lib/utils";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRestaurant("OWNER");
  const inv = await prisma.invoice.findFirst({ where: { id: (await params).id, restaurantId: ctx.restaurant.id }, include: { lines: { orderBy: [{ kind: "desc" }, { orderDate: "asc" }] }, payments: { orderBy: { createdAt: "desc" } } } });
  if (!inv) notFound();
  const settings = await getSettings();
  const due = outstanding(inv);
  const events = await prisma.commissionEvent.findMany({ where: { invoiceId: inv.id }, select: { id: true, status: true, disputes: { select: { status: true } } } });
  const evMap = new Map(events.map((e) => [e.id, e]));
  const withinWindow = Date.now() - (inv.issuedAt ?? inv.createdAt).getTime() < settings.disputeWindowDays * 86400_000;
  return (
    <DashPage
      title={`Invoice ${inv.number}`}
      description={<>{periodLabel(inv.period)} · issued {inv.issuedAt ? formatDate(inv.issuedAt) : "—"} · due {formatDate(inv.dueDate)}</>}
      actions={
        <>
          <a href={`/api/invoices/${inv.id}/pdf`} className={buttonClass("outline", "sm")}>
            <FileText className="h-4 w-4" /> Invoice PDF
          </a>
          <a href={`/api/invoices/${inv.id}/csv`} className={buttonClass("outline", "sm")}>
            <Download className="h-4 w-4" /> Statement CSV
          </a>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Section title="Summary" actions={<StatusBadge status={inv.status} />}>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink-muted">Commissionable orders</dt>
            <dd className="tabular text-right">{inv.orderCount}</dd>
            <dt className="text-ink-muted">Gross eligible subtotal</dt>
            <dd className="tabular text-right">{formatMoney(inv.grossSubtotalCents)}</dd>
            <dt className="text-ink-muted">Commission rate</dt>
            <dd className="text-right">{formatRate(inv.rateBps)}</dd>
            <dt className="text-ink-muted">Gross commission</dt>
            <dd className="tabular text-right">{formatMoney(inv.grossCommissionCents)}</dd>
            <dt className="text-ink-muted">Approved adjustments</dt>
            <dd className="tabular text-right">{formatMoney(inv.adjustmentsCents)}</dd>
            {inv.previousCreditCents !== 0 && (
              <>
                <dt className="text-ink-muted">Previous credits</dt>
                <dd className="tabular text-right">{formatMoney(inv.previousCreditCents)}</dd>
              </>
            )}
            <dt className="font-bold">Total</dt>
            <dd className="tabular text-right font-bold">{formatMoney(inv.totalDueCents)}</dd>
            <dt className="text-ink-muted">Verified payments</dt>
            <dd className="tabular text-right">{formatMoney(inv.paidCents)}</dd>
            <dt className="text-lg font-black">Amount due</dt>
            <dd className="tabular text-right text-lg font-black text-brand-600">{formatMoney(due)}</dd>
          </dl>
        </Section>
        <div className="space-y-3">
          {due > 0 && <PayWhishButton block invoice={{ id: inv.id, number: inv.number, outstandingCents: due }} whish={settings.whish} />}
          {withinWindow && inv.status !== "PAID" && (
            <div className="card p-4 text-sm">
              Something wrong with this invoice? <DisputeButton invoiceId={inv.id} label="Dispute invoice" />
            </div>
          )}
          {inv.payments.length > 0 && (
            <div className="card p-4">
              <div className="mb-2 text-sm font-bold">Payments</div>
              <ul className="space-y-2 text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      {formatMoney(p.verifiedAmountCents ?? p.amountCents)} <span className="text-xs text-ink-muted">· {formatDate(p.paymentDate)}</span>
                    </span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <Section title="Itemized statement" description="Every order reference included in this invoice.">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="table-app">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Order date</th>
                <th>Subtotal</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Adjustment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => {
                const ev = l.commissionEventId ? evMap.get(l.commissionEventId) : undefined;
                const disputed = ev?.disputes.some((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
                return (
                  <tr key={l.id}>
                    <td className="font-mono text-xs">{l.orderReference ? <Link href={`/dashboard/orders?ref=${l.orderReference}`} className="text-brand-600">{l.orderReference}</Link> : <span className="font-sans">{l.description}</span>}</td>
                    <td className="whitespace-nowrap">{l.orderDate ? formatDate(l.orderDate) : "—"}</td>
                    <td className="tabular">{l.subtotalCents ? formatMoney(l.subtotalCents) : "—"}</td>
                    <td>{l.rateBps != null ? formatRate(l.rateBps) : "—"}</td>
                    <td className="tabular font-semibold">{formatMoney(l.amountCents)}</td>
                    <td className="text-xs">{disputed ? "Disputed" : l.adjustmentStatus === "CREDITED" ? "Credited" : l.adjustmentStatus === "APPROVED" ? "Approved" : "—"}</td>
                    <td className="text-right">{ev && !disputed && l.adjustmentStatus !== "CREDITED" && withinWindow && <DisputeButton commissionEventId={ev.id} small />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </DashPage>
  );
}
