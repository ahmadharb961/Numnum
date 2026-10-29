import Link from "next/link";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { ActionButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/dashboard/invoice-status";
import { EmptyState } from "@/components/ui/misc";
import { decideVerificationAction } from "@/actions/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Verifications" };

export default async function VerificationsPage() {
  const list = await prisma.restaurantVerification.findMany({
    where: { status: { in: ["PENDING", "INFO_REQUIRED"] } },
    orderBy: { createdAt: "asc" },
    include: { restaurant: { select: { id: true, displayName: true, businessName: true, phone: true, address: true } }, documents: true },
  });
  const recent = await prisma.restaurantVerification.findMany({ where: { status: { in: ["APPROVED", "REJECTED", "REVOKED"] } }, orderBy: { reviewedAt: "desc" }, take: 20, include: { restaurant: { select: { displayName: true } } } });
  return (
    <DashPage title="Verification requests" description="The badge certifies business identity only. It is never granted for paying commission or advertising.">
      {!list.length && <div className="card mb-5"><EmptyState title="No pending requests" /></div>}
      <div className="space-y-4">
        {list.map((v) => (
          <div key={v.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/admin/restaurants/${v.restaurant.id}`} className="text-lg font-bold text-brand-600">
                  {v.restaurant.displayName}
                </Link>
                <div className="text-xs text-ink-muted">Submitted {formatDateTime(v.createdAt)}</div>
              </div>
              <StatusBadge status={v.status === "INFO_REQUIRED" ? "MORE_INFO_REQUESTED" : v.status} />
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-ink-muted">Legal name: </dt>
                <dd className="inline font-semibold">{v.legalName}</dd>
              </div>
              <div>
                <dt className="inline text-ink-muted">Registered as: </dt>
                <dd className="inline">{v.restaurant.businessName}</dd>
              </div>
              <div>
                <dt className="inline text-ink-muted">Registration #: </dt>
                <dd className="inline">{v.registration ?? "—"}</dd>
              </div>
              <div>
                <dt className="inline text-ink-muted">Contact: </dt>
                <dd className="inline">
                  {v.contactName} {v.contactRole && `(${v.contactRole})`}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-ink-muted">Address: </dt>
                <dd className="inline">{v.restaurant.address ?? "—"}</dd>
              </div>
              {v.notes && <div className="sm:col-span-2 text-ink-muted">“{v.notes}”</div>}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {v.documents.map((d) => (
                <a key={d.id} href={d.url} target="_blank" rel="noopener" className="chip h-9 text-xs">
                  📄 {d.originalName ?? "Document"}
                </a>
              ))}
              {!v.documents.length && <span className="text-xs text-red-600">No documents attached</span>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton variant="primary" action={decideVerificationAction.bind(null, v.id, "APPROVED")} prompt="Optional note to the restaurant" promptDefault="">
                Approve
              </ActionButton>
              <ActionButton action={decideVerificationAction.bind(null, v.id, "INFO_REQUIRED")} prompt="What additional information is needed?">
                Request info
              </ActionButton>
              <ActionButton variant="danger" action={decideVerificationAction.bind(null, v.id, "REJECTED")} prompt="Reason for rejection">
                Reject
              </ActionButton>
            </div>
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="card mt-6 p-4">
          <h2 className="mb-2 font-bold">Recent decisions</h2>
          <ul className="divide-y divide-black/5 text-sm">
            {recent.map((v) => (
              <li key={v.id} className="flex justify-between py-2">
                <span>{v.restaurant.displayName}</span>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  {v.reviewedAt && formatDateTime(v.reviewedAt)} <StatusBadge status={v.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashPage>
  );
}
