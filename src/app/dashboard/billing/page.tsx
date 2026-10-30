import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { outstanding, restaurantBillingSummary } from "@/server/billing";
import { DashPage, Section } from "@/components/dashboard/page";
import { PayWhishButton } from "@/components/dashboard/pay-whish";
import { DisputeButton } from "@/components/dashboard/dispute-button";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { StatCard, EmptyState, Alert } from "@/components/ui/misc";
import { formatMoney, formatRate } from "@/lib/money";
import { formatDate, periodLabel } from "@/lib/utils";

export const metadata = { title: "Billing & Commissions" };

const BILLABLE: Record<string, string> = { ACCEPTED: "you accept an order", COMPLETED: "an order is completed (delivered or picked up)" };

export default async function BillingPage() {
  const ctx = await requireRestaurant("OWNER");
  const r = ctx.restaurant;
  const s = await restaurantBillingSummary(r.id);
  const rate = r.commissionRateBps ?? s.settings.defaultCommissionRateBps;
  const [invoices, payments, entries, disputes] = await Promise.all([
    prisma.invoice.findMany({ where: { restaurantId: r.id }, orderBy: { createdAt: "desc" }, take: 24 }),
    prisma.payment.findMany({ where: { restaurantId: r.id }, orderBy: { createdAt: "desc" }, take: 20, include: { invoice: { select: { number: true } } } }),
    prisma.commissionEvent.findMany({ where: { restaurantId: r.id, invoiceId: null, status: { in: ["ACCRUED", "DISPUTED"] } }, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { createdAt: true } } } }),
    prisma.commissionDispute.findMany({ where: { restaurantId: r.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const payable = s.openInvoices.find((i) => outstanding(i) > 0 && i.status !== "DISPUTED");

  return (
    <DashPage title="Billing & Commissions" description={<>Commission is {formatRate(rate)} of the item subtotal, created when {BILLABLE[s.settings.billableEvent]}. Billed monthly; pay via Whish.</>}>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="This month (estimated)" value={formatMoney(s.currentEstimateCents)} sub={`${s.currentCount} orders · ${formatMoney(s.currentSubtotalCents)} subtotal`} />
        <StatCard label="Last invoice" value={s.lastInvoice ? formatMoney(s.lastInvoice.totalDueCents) : "—"} sub={s.lastInvoice ? `${s.lastInvoice.number} · ${periodLabel(s.lastInvoice.period)}` : "No invoices yet"} />
        <StatCard label="Outstanding balance" value={formatMoney(s.outstandingCents)} tone={s.outstandingCents ? "red" : "green"} />
        <StatCard label="Next due date" value={s.nextDue ? formatDate(s.nextDue) : "—"} sub={payable ? <StatusBadge status={payable.status} /> : "Nothing due"} />
      </div>

      {payable && (
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-sm text-ink-muted">
              Invoice {payable.number} · due {formatDate(payable.dueDate)}
            </div>
            <div className="tabular text-2xl font-black">{formatMoney(outstanding(payable))}</div>
            {payable.status === "PAYMENT_SUBMITTED" && <div className="text-sm text-sky-700">Your payment is awaiting verification.</div>}
          </div>
          <PayWhishButton invoice={{ id: payable.id, number: payable.number, outstandingCents: outstanding(payable) }} whish={s.settings.whish} />
        </div>
      )}
      {!r.agreementAcceptedAt && <Alert className="mb-5">You haven&apos;t accepted the commission agreement yet, so online ordering is off. <Link className="font-semibold underline" href="/dashboard/agreement">Review agreement</Link></Alert>}

      <Section title="Invoices">
        {invoices.length ? (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="table-app">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Period</th>
                  <th>Orders</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono text-xs font-semibold">
                      <Link href={`/dashboard/billing/${i.id}`} className="text-brand-600">
                        {i.number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{periodLabel(i.period)}</td>
                    <td className="tabular">{i.orderCount}</td>
                    <td className="tabular font-semibold">{formatMoney(i.totalDueCents)}</td>
                    <td className="tabular">{formatMoney(i.paidCents)}</td>
                    <td className="whitespace-nowrap">{formatDate(i.dueDate)}</td>
                    <td>
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <a href={`/api/invoices/${i.id}/pdf`} className="mr-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                        <FileText className="h-3.5 w-3.5" /> PDF
                      </a>
                      <a href={`/api/invoices/${i.id}/csv`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                        <Download className="h-3.5 w-3.5" /> CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No invoices yet" body="Invoices are generated at the start of each month for the previous month's commissionable orders." />
        )}
      </Section>

      <Section title="Commission entries not yet invoiced" description="Check these order references. You can dispute an entry if the order wasn't genuine.">
        {entries.length ? (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="table-app">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Subtotal</th>
                  <th>Rate</th>
                  <th>Commission</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono text-xs">
                      <Link href={`/dashboard/orders?ref=${e.orderReference}`} className="text-brand-600">
                        {e.orderReference}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(e.order.createdAt)}</td>
                    <td className="tabular">{formatMoney(e.baseCents)}</td>
                    <td>{formatRate(e.rateBps)}</td>
                    <td className="tabular font-semibold">{formatMoney(e.commissionCents)}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="text-right">{e.status === "ACCRUED" && <DisputeButton commissionEventId={e.id} small />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No pending commission entries.</p>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Payment history">
          {payments.length ? (
            <ul className="divide-y divide-black/5 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="font-semibold">
                      {formatMoney(p.verifiedAmountCents ?? p.amountCents)} <span className="font-normal text-ink-muted">· {p.invoice.number}</span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {formatDate(p.paymentDate)} · ref {p.whishReference}
                      {p.reviewNote && ` · “${p.reviewNote}”`}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No payments yet.</p>
          )}
        </Section>
        <Section title="Disputes">
          {disputes.length ? (
            <ul className="divide-y divide-black/5 text-sm">
              {disputes.map((d) => (
                <li key={d.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{d.reason}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="text-xs text-ink-muted">
                    Opened {formatDate(d.createdAt)}
                    {d.resolution && ` · ${d.resolution}`}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No disputes.</p>
          )}
          <p className="mt-3 text-xs text-ink-muted">Disputes must be opened within {s.settings.disputeWindowDays} days of the entry or invoice date.</p>
        </Section>
      </div>
    </DashPage>
  );
}
