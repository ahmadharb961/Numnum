import Link from "next/link";
import { prisma } from "@/server/db";
import { outstanding } from "@/server/billing";
import { DashPage } from "@/components/dashboard/page";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { PaymentReviewForm } from "@/components/admin/payment-review";
import { EmptyState, Alert } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Whish payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const f = (await searchParams).f ?? "pending";
  const payments = await prisma.payment.findMany({
    where: f === "pending" ? { status: { in: ["SUBMITTED", "MORE_INFO_REQUESTED"] } } : {},
    orderBy: { createdAt: f === "pending" ? "asc" : "desc" },
    take: 100,
    include: { invoice: true, restaurant: { select: { id: true, displayName: true } }, evidence: { include: { asset: true } } },
  });
  return (
    <DashPage title="Whish payment verification" description="Confirm funds were actually received in the Whish account before approving. A screenshot alone is not proof of settlement.">
      <div className="mb-4 flex gap-2">
        <Link href="/admin/payments" className={cn("chip h-9 text-xs", f === "pending" && "chip-active")}>
          Awaiting review
        </Link>
        <Link href="/admin/payments?f=all" className={cn("chip h-9 text-xs", f === "all" && "chip-active")}>
          All
        </Link>
      </div>
      {!payments.length && <div className="card"><EmptyState title="No payments waiting for review" /></div>}
      <div className="space-y-4">
        {payments.map((p) => {
          const dup = p.amountCents > outstanding(p.invoice);
          return (
            <div key={p.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">
                    {formatMoney(p.amountCents)} <span className="text-sm font-normal text-ink-muted">claimed by</span>{" "}
                    <Link href={`/admin/restaurants/${p.restaurant.id}`} className="text-brand-600">
                      {p.restaurant.displayName}
                    </Link>
                  </div>
                  <div className="text-sm text-ink-muted">
                    Invoice{" "}
                    <Link href={`/admin/invoices/${p.invoiceId}`} className="font-mono text-brand-600">
                      {p.invoice.number}
                    </Link>{" "}
                    · outstanding {formatMoney(outstanding(p.invoice))} · Whish ref <span className="font-mono font-semibold text-ink">{p.whishReference}</span> · paid {formatDate(p.paymentDate)} · submitted {formatDateTime(p.createdAt)}
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              {dup && <Alert className="mt-3">Claimed amount exceeds the outstanding balance.</Alert>}
              {p.reviewNote && <p className="mt-2 text-sm text-ink-muted">Last note: {p.reviewNote}</p>}
              <div className="mt-3 flex flex-wrap gap-3">
                {p.evidence.map((e) =>
                  e.asset.mimeType.startsWith("image/") ? (
                    <a key={e.id} href={e.asset.url} target="_blank" rel="noopener" className="block h-40 w-28 overflow-hidden rounded-xl border border-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.asset.thumbUrl ?? e.asset.url} alt="Payment receipt" className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <a key={e.id} href={e.asset.url} target="_blank" rel="noopener" className="chip h-9 text-xs">
                      📄 {e.asset.originalName ?? "Receipt"}
                    </a>
                  ),
                )}
                {!p.evidence.length && <span className="text-xs text-ink-muted">No receipt attached</span>}
              </div>
              {(p.status === "SUBMITTED" || p.status === "MORE_INFO_REQUESTED") && <PaymentReviewForm paymentId={p.id} amountCents={p.amountCents} />}
            </div>
          );
        })}
      </div>
    </DashPage>
  );
}
