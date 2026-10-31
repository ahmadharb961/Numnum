import type { Metadata } from "next";
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
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Billing & Commissions") };
}

const BILLABLE: Record<string, string> = { ACCEPTED: "you accept an order", COMPLETED: "an order is completed (delivered or picked up)" };

export default async function BillingPage() {
  const t = await getT();
  const lang = await getLocale();
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
    <DashPage title={t("Billing & Commissions")} description={t("Commission is {rate} of the item subtotal, created when {event}. Billed monthly; pay via Whish.", { rate: formatRate(rate), event: t(BILLABLE[s.settings.billableEvent]) })}>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="This month (estimated)" value={formatMoney(s.currentEstimateCents)} sub={t("{n} orders · {amount} subtotal", { n: s.currentCount, amount: formatMoney(s.currentSubtotalCents) })} />
        <StatCard label="Last invoice" value={s.lastInvoice ? formatMoney(s.lastInvoice.totalDueCents) : "—"} sub={s.lastInvoice ? `${s.lastInvoice.number} · ${periodLabel(s.lastInvoice.period, lang)}` : "No invoices yet"} />
        <StatCard label="Outstanding balance" value={formatMoney(s.outstandingCents)} tone={s.outstandingCents ? "red" : "green"} />
        <StatCard label="Next due date" value={s.nextDue ? formatDate(s.nextDue, undefined, lang) : "—"} sub={payable ? <StatusBadge status={payable.status} /> : "Nothing due"} />
      </div>

      {payable && (
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-sm text-ink-muted">
              Invoice {payable.number} · due {formatDate(payable.dueDate, undefined, lang)}
            </div>
            <div className="tabular text-2xl font-black">{formatMoney(outstanding(payable))}</div>
            {payable.status === "PAYMENT_SUBMITTED" && <div className="text-sm text-sky-700">{t("Your payment is awaiting verification.")}</div>}
          </div>
          <PayWhishButton invoice={{ id: payable.id, number: payable.number, outstandingCents: outstanding(payable) }} whish={s.settings.whish} />
        </div>
      )}
      {!r.agreementAcceptedAt && <Alert className="mb-5">You haven&apos;t accepted the commission agreement yet, so online ordering is off. <Link className="font-semibold underline" href="/dashboard/agreement">{t("Review agreement")}</Link></Alert>}

      <Section title={t("Invoices")}>
        {invoices.length ? (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="table-app">
              <thead>
                <tr>
                  <th>{t("Invoice")}</th>
                  <th>{t("Period")}</th>
                  <th>{t("Orders")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Paid")}</th>
                  <th>{t("Due")}</th>
                  <th>{t("Status")}</th>
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
                    <td className="whitespace-nowrap">{periodLabel(i.period, lang)}</td>
                    <td className="tabular">{i.orderCount}</td>
                    <td className="tabular font-semibold">{formatMoney(i.totalDueCents)}</td>
                    <td className="tabular">{formatMoney(i.paidCents)}</td>
                    <td className="whitespace-nowrap">{formatDate(i.dueDate, undefined, lang)}</td>
                    <td>
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="whitespace-nowrap text-end">
                      <a href={`/api/invoices/${i.id}/pdf`} className="me-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                        <FileText className="h-3.5 w-3.5" /> {t("PDF")}
                      </a>
                      <a href={`/api/invoices/${i.id}/csv`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                        <Download className="h-3.5 w-3.5" /> {t("CSV")}
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

      <Section title={t("Commission entries not yet invoiced")} description={t("Check these order references. You can dispute an entry if the order wasn't genuine.")}>
        {entries.length ? (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="table-app">
              <thead>
                <tr>
                  <th>{t("Order")}</th>
                  <th>{t("Date")}</th>
                  <th>{t("Subtotal")}</th>
                  <th>{t("Rate")}</th>
                  <th>{t("Commission")}</th>
                  <th>{t("Status")}</th>
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
                    <td className="whitespace-nowrap">{formatDate(e.order.createdAt, undefined, lang)}</td>
                    <td className="tabular">{formatMoney(e.baseCents)}</td>
                    <td>{formatRate(e.rateBps)}</td>
                    <td className="tabular font-semibold">{formatMoney(e.commissionCents)}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="text-end">{e.status === "ACCRUED" && <DisputeButton commissionEventId={e.id} small />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t("No pending commission entries.")}</p>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("Payment history")}>
          {payments.length ? (
            <ul className="divide-y divide-black/5 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="font-semibold">
                      {formatMoney(p.verifiedAmountCents ?? p.amountCents)} <span className="font-normal text-ink-muted">· {p.invoice.number}</span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {formatDate(p.paymentDate, undefined, lang)} · ref {p.whishReference}
                      {p.reviewNote && ` · “${p.reviewNote}”`}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t("No payments yet.")}</p>
          )}
        </Section>
        <Section title={t("Disputes")}>
          {disputes.length ? (
            <ul className="divide-y divide-black/5 text-sm">
              {disputes.map((d) => (
                <li key={d.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{d.reason}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="text-xs text-ink-muted">
                    Opened {formatDate(d.createdAt, undefined, lang)}
                    {d.resolution && ` · ${d.resolution}`}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t("No disputes.")}</p>
          )}
          <p className="mt-3 text-xs text-ink-muted">Disputes must be opened within {s.settings.disputeWindowDays} days of the entry or invoice date.</p>
        </Section>
      </div>
    </DashPage>
  );
}
