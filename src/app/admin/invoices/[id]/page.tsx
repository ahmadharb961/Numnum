import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { prisma } from "@/server/db";
import { outstanding } from "@/server/billing";
import { DashPage, Section } from "@/components/dashboard/page";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { ActionButton } from "@/components/admin/action-button";
import { AdjustmentForm } from "@/components/admin/adjustment-form";
import { ManualPaymentForm } from "@/components/admin/manual-payment-form";
import { applyAdjustmentAction, refreshInvoiceAction } from "@/actions/admin";
import { formatMoney, formatRate } from "@/lib/money";
import { formatDate, formatDateTime, periodLabel } from "@/lib/utils";

export const metadata = { title: "Invoice" };

export default async function AdminInvoice({ params }: { params: Promise<{ id: string }> }) {
  const inv = await prisma.invoice.findUnique({
    where: { id: (await params).id },
    include: { restaurant: { select: { id: true, displayName: true } }, lines: { orderBy: [{ kind: "desc" }, { orderDate: "asc" }] }, payments: { orderBy: { createdAt: "desc" }, include: { evidence: { include: { asset: true } } } }, disputes: true },
  });
  if (!inv) notFound();
  const pendingAdj = await prisma.commissionAdjustment.findMany({ where: { restaurantId: inv.restaurantId, status: "APPROVED", invoiceId: null } });
  const audits = await prisma.auditLog.findMany({ where: { OR: [{ entityType: "invoice", entityId: inv.id }, { entityType: "payment", entityId: { in: inv.payments.map((p) => p.id) } }] }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } });
  return (
    <DashPage
      title={`Invoice ${inv.number}`}
      description={
        <>
          <Link href={`/admin/restaurants/${inv.restaurant.id}`} className="font-semibold text-brand-600">
            {inv.restaurant.displayName}
          </Link>{" "}
          · {periodLabel(inv.period)} · due {formatDate(inv.dueDate)}
        </>
      }
      actions={
        <>
          <a href={`/api/invoices/${inv.id}/pdf`} className="chip h-9 text-xs">
            <FileText className="h-4 w-4" /> PDF
          </a>
          <a href={`/api/invoices/${inv.id}/csv`} className="chip h-9 text-xs">
            <Download className="h-4 w-4" /> CSV
          </a>
          <ActionButton action={refreshInvoiceAction.bind(null, inv.id)}>Recalculate status</ActionButton>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Section title="Summary" actions={<StatusBadge status={inv.status} />}>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-muted">Orders</dt>
            <dd className="text-right">{inv.orderCount}</dd>
            <dt className="text-ink-muted">Gross subtotal</dt>
            <dd className="text-right">{formatMoney(inv.grossSubtotalCents)}</dd>
            <dt className="text-ink-muted">Rate</dt>
            <dd className="text-right">{formatRate(inv.rateBps)}</dd>
            <dt className="text-ink-muted">Gross commission</dt>
            <dd className="text-right">{formatMoney(inv.grossCommissionCents)}</dd>
            <dt className="text-ink-muted">Adjustments</dt>
            <dd className="text-right">{formatMoney(inv.adjustmentsCents)}</dd>
            <dt className="font-bold">Total</dt>
            <dd className="text-right font-bold">{formatMoney(inv.totalDueCents)}</dd>
            <dt className="text-ink-muted">Verified paid</dt>
            <dd className="text-right">{formatMoney(inv.paidCents)}</dd>
            <dt className="font-black">Outstanding</dt>
            <dd className="text-right font-black text-brand-600">{formatMoney(outstanding(inv))}</dd>
          </dl>
        </Section>
        <div className="space-y-5">
          {outstanding(inv) > 0 && (
            <Section title="Record reconciled payment" description="Use when funds were received outside a restaurant submission.">
              <ManualPaymentForm invoiceId={inv.id} outstandingCents={outstanding(inv)} />
            </Section>
          )}
          {pendingAdj.length > 0 && inv.status !== "PAID" && (
            <Section title="Unapplied adjustments">
              <ul className="space-y-2 text-sm">
                {pendingAdj.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span>
                      {formatMoney(a.amountCents)} · {a.reason}
                    </span>
                    <ActionButton action={applyAdjustmentAction.bind(null, a.id, inv.id)} confirm="Apply as a credit/debit note on this invoice?">
                      Apply
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
      <Section title="Payments">
        {inv.payments.length ? (
          <ul className="divide-y divide-black/5 text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-semibold">
                    {formatMoney(p.amountCents)} claimed{p.verifiedAmountCents != null && ` · ${formatMoney(p.verifiedAmountCents)} verified`}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {p.method} · ref {p.whishReference} · paid {formatDate(p.paymentDate)} · {p.reviewNote}
                  </div>
                  <div className="mt-1 flex gap-2">
                    {p.evidence.map((e) => (
                      <a key={e.id} href={e.asset.url} target="_blank" rel="noopener" className="text-xs font-semibold text-brand-600">
                        Receipt ↗
                      </a>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  {(p.status === "SUBMITTED" || p.status === "MORE_INFO_REQUESTED") && (
                    <Link href={`/admin/payments?id=${p.id}`} className="text-xs font-semibold text-brand-600">
                      Review →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No payments.</p>
        )}
      </Section>
      <Section title="Adjust this invoice">
        <AdjustmentForm restaurantId={inv.restaurantId} invoiceId={inv.id} />
      </Section>
      <Section title="Itemized statement">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="table-app">
            <thead>
              <tr>
                <th>Type</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Description</th>
                <th>Subtotal</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Adj.</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs">{l.kind}</td>
                  <td className="font-mono text-xs">{l.orderReference ?? "—"}</td>
                  <td className="whitespace-nowrap">{l.orderDate ? formatDate(l.orderDate) : "—"}</td>
                  <td>{l.description}</td>
                  <td>{l.subtotalCents ? formatMoney(l.subtotalCents) : "—"}</td>
                  <td>{l.rateBps != null ? formatRate(l.rateBps) : "—"}</td>
                  <td className="font-semibold">{formatMoney(l.amountCents)}</td>
                  <td className="text-xs">{l.adjustmentStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Audit trail">
        <ul className="space-y-1 text-xs">
          {audits.map((a) => (
            <li key={a.id}>
              {formatDateTime(a.createdAt)} · <b>{a.action}</b> by {a.actor?.name ?? "system"}
            </li>
          ))}
        </ul>
      </Section>
    </DashPage>
  );
}
