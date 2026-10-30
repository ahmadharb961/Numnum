import Link from "next/link";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/misc";
import { resolveDisputeAction, markDisputeReviewingAction } from "@/actions/admin";
import { formatMoney } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Disputes" };

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const f = (await searchParams).f ?? "open";
  const disputes = await prisma.commissionDispute.findMany({
    where: f === "open" ? { status: { in: ["OPEN", "UNDER_REVIEW"] } } : {},
    orderBy: { createdAt: "asc" },
    include: { restaurant: { select: { id: true, displayName: true } }, commissionEvent: { include: { order: { include: { events: { orderBy: { createdAt: "asc" } }, items: true } } } }, invoice: { select: { id: true, number: true } } },
  });
  return (
    <DashPage title="Commission disputes">
      <div className="mb-4 flex gap-2">
        <Link href="/admin/disputes" className={cn("chip h-9 text-xs", f === "open" && "chip-active")}>
          Open
        </Link>
        <Link href="/admin/disputes?f=all" className={cn("chip h-9 text-xs", f === "all" && "chip-active")}>
          All
        </Link>
      </div>
      {!disputes.length && <div className="card"><EmptyState title="No disputes" /></div>}
      <div className="space-y-4">
        {disputes.map((d) => {
          const o = d.commissionEvent?.order;
          return (
            <div key={d.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{d.reason}</div>
                  <div className="text-sm text-ink-muted">
                    <Link href={`/admin/restaurants/${d.restaurant.id}`} className="text-brand-600">
                      {d.restaurant.displayName}
                    </Link>{" "}
                    · opened {formatDateTime(d.createdAt)}
                    {d.invoice && (
                      <>
                        {" "}
                        · invoice{" "}
                        <Link href={`/admin/invoices/${d.invoice.id}`} className="font-mono text-brand-600">
                          {d.invoice.number}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>
              {d.details && <p className="mt-2 text-sm">{d.details}</p>}
              {d.commissionEvent && o && (
                <div className="mt-3 rounded-xl bg-cream p-3 text-sm">
                  <div>
                    Order <span className="font-mono font-semibold">{o.reference}</span> · {formatMoney(o.subtotalCents, o.currency)} · commission {formatMoney(d.commissionEvent.commissionCents)} ({d.commissionEvent.status.toLowerCase()})
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">Items: {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</div>
                  <div className="mt-1 text-xs text-ink-muted">
                    Status: {o.status.toLowerCase().replace(/_/g, " ")}{o.autoCompleted ? " (auto-completed)" : ""} · duplicate flag: {o.suspicious ? o.suspiciousReason : "no"}{o.failureReason ? ` · failure: ${o.failureReason}` : ""}
                  </div>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-ink-muted">Order event log</summary>
                    <ul>
                      {o.events.map((e) => (
                        <li key={e.id}>
                          {formatDateTime(e.createdAt)} · {e.type} ({e.actorType})
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
              {d.resolution && <p className="mt-2 text-sm text-ink-muted">Resolution: {d.resolution}</p>}
              {(d.status === "OPEN" || d.status === "UNDER_REVIEW") && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {d.status === "OPEN" && <ActionButton action={markDisputeReviewingAction.bind(null, d.id)}>Mark under review</ActionButton>}
                  <ActionButton variant="primary" action={resolveDisputeAction.bind(null, d.id, true)} prompt="Resolution (shared with restaurant). Accepting voids the entry or credits it on the next invoice.">
                    Accept dispute
                  </ActionButton>
                  <ActionButton variant="danger" action={resolveDisputeAction.bind(null, d.id, false)} prompt="Why is the dispute rejected?">
                    Reject dispute
                  </ActionButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashPage>
  );
}
