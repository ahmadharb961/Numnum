import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Download } from "lucide-react";
import { prisma } from "@/server/db";
import { DashPage, Section } from "@/components/dashboard/page";
import { ActionButton } from "@/components/admin/action-button";
import { InvoiceGenerator } from "@/components/admin/invoice-generator";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { decideAdjustmentAction, voidCommissionAction } from "@/actions/admin";
import { formatMoney, formatRate } from "@/lib/money";
import { cn, formatDate, previousPeriod } from "@/lib/utils";

export const metadata = { title: "Commissions" };

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ status?: string; period?: string; q?: string }> }) {
  const sp = await searchParams;
  const where: Prisma.CommissionEventWhereInput = {
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.period ? { period: sp.period } : {}),
    ...(sp.q ? { OR: [{ orderReference: { contains: sp.q.toUpperCase() } }, { restaurant: { displayName: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [events, agg, adjustments, balances] = await Promise.all([
    prisma.commissionEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { restaurant: { select: { displayName: true } } } }),
    prisma.commissionEvent.aggregate({ where, _sum: { baseCents: true, commissionCents: true }, _count: true }),
    prisma.commissionAdjustment.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { restaurant: { select: { displayName: true } } } }),
    prisma.$queryRaw<{ restaurantId: string; name: string; outstanding: bigint }[]>`
      SELECT i."restaurantId", r."displayName" AS name, SUM(GREATEST(i."totalDueCents" - i."paidCents", 0))::bigint AS outstanding
      FROM invoices i JOIN restaurants r ON r.id = i."restaurantId"
      WHERE i.status NOT IN ('PAID', 'DRAFT')
      GROUP BY i."restaurantId", r."displayName"
      HAVING SUM(GREATEST(i."totalDueCents" - i."paidCents", 0)) > 0
      ORDER BY outstanding DESC LIMIT 50`,
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${u}`;
  };
  return (
    <DashPage
      title="Commission ledger"
      actions={
        <>
          <a href={`/api/admin/export?type=commissions${sp.period ? `&period=${sp.period}` : ""}`} className="chip h-9 text-xs">
            <Download className="h-4 w-4" /> Commissions CSV
          </a>
          <a href="/api/admin/export?type=invoices" className="chip h-9 text-xs">
            <Download className="h-4 w-4" /> Invoices CSV
          </a>
          <a href="/api/admin/export?type=payments" className="chip h-9 text-xs">
            <Download className="h-4 w-4" /> Payments CSV
          </a>
        </>
      }
    >
      <Section title="Monthly invoicing" description="Invoices are generated automatically on the 1st by the scheduled billing job. Preview and run it manually here.">
        <InvoiceGenerator defaultPeriod={previousPeriod()} />
      </Section>

      <Section title="Commission events" description={`${agg._count} entries · ${formatMoney(agg._sum.baseCents ?? 0)} subtotal · ${formatMoney(agg._sum.commissionCents ?? 0)} commission`}>
        <form className="mb-3 flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q} className="input h-9 w-48 text-sm" placeholder="Reference / restaurant" />
          <input name="period" defaultValue={sp.period} className="input h-9 w-32 text-sm" placeholder="YYYY-MM" pattern="\d{4}-\d{2}" />
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <button className="chip h-9 text-xs">Filter</button>
        </form>
        <div className="mb-3 flex flex-wrap gap-2">
          {["", "ACCRUED", "INVOICED", "DISPUTED", "VOIDED"].map((s) => (
            <Link key={s} href={qs({ status: s || undefined })} className={cn("chip h-8 text-xs", (sp.status ?? "") === s && "chip-active")}>
              {s ? s.toLowerCase() : "all"}
            </Link>
          ))}
        </div>
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="table-app">
            <thead>
              <tr>
                <th>Order</th>
                <th>Restaurant</th>
                <th>Period</th>
                <th>Event</th>
                <th>Base</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">
                    <Link href={`/admin/orders?q=${e.orderReference}`} className="text-brand-600">
                      {e.orderReference}
                    </Link>
                  </td>
                  <td>{e.restaurant.displayName}</td>
                  <td>{e.period}</td>
                  <td className="text-xs">{e.billableEvent.toLowerCase()}</td>
                  <td className="tabular">{formatMoney(e.baseCents)}</td>
                  <td>{formatRate(e.rateBps)}</td>
                  <td className="tabular font-semibold">{formatMoney(e.commissionCents)}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td>{e.status === "ACCRUED" && <ActionButton variant="ghost" action={voidCommissionAction.bind(null, e.id)} prompt="Reason for voiding this commission entry">Void</ActionButton>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Adjustments & credits">
          <ul className="divide-y divide-black/5 text-sm">
            {adjustments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-semibold">
                    {formatMoney(a.amountCents)} · {a.restaurant.displayName}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {a.reason} · {formatDate(a.createdAt)} {a.invoiceId ? "· applied" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  {a.status === "PENDING" && (
                    <>
                      <ActionButton action={decideAdjustmentAction.bind(null, a.id, true)}>Approve</ActionButton>
                      <ActionButton variant="ghost" action={decideAdjustmentAction.bind(null, a.id, false)}>
                        Reject
                      </ActionButton>
                    </>
                  )}
                </div>
              </li>
            ))}
            {!adjustments.length && <li className="py-2 text-ink-muted">No adjustments. Create them from a restaurant or invoice page.</li>}
          </ul>
        </Section>
        <Section title="Outstanding balances">
          <ul className="divide-y divide-black/5 text-sm">
            {balances.map((b) => (
              <li key={b.restaurantId} className="flex justify-between py-2">
                <Link href={`/admin/restaurants/${b.restaurantId}`} className="text-brand-600">
                  {b.name}
                </Link>
                <span className="tabular font-semibold">{formatMoney(Number(b.outstanding))}</span>
              </li>
            ))}
            {!balances.length && <li className="py-2 text-ink-muted">No outstanding balances.</li>}
          </ul>
        </Section>
      </div>
    </DashPage>
  );
}
