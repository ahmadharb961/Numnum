import Link from "next/link";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.q ? { OR: [{ action: { contains: sp.q } }, { entityType: { contains: sp.q } }, { entityId: sp.q }] } : {};
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 100, include: { actor: { select: { name: true, email: true } } } });
  return (
    <DashPage title="Audit log">
      <form className="mb-3">
        <input name="q" defaultValue={sp.q} className="input h-10 max-w-sm text-sm" placeholder="Filter by action, entity type or id" />
      </form>
      <div className="card overflow-x-auto">
        <table className="table-app">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</td>
                <td className="text-xs">{l.actor ? `${l.actor.name} (${l.actor.email})` : "system"}</td>
                <td className="font-mono text-xs">{l.action}</td>
                <td className="text-xs">
                  {l.entityType}
                  {l.entityId && <div className="font-mono text-[10px] text-ink-muted">{l.entityId}</div>}
                </td>
                <td className="max-w-md">
                  {l.data ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-ink-muted">view</summary>
                      <pre className="whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(l.data, null, 2)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {page > 1 && <Link className="chip" href={`/admin/audit?page=${page - 1}${sp.q ? `&q=${sp.q}` : ""}`}>Newer</Link>}
        {logs.length === 100 && <Link className="chip" href={`/admin/audit?page=${page + 1}${sp.q ? `&q=${sp.q}` : ""}`}>Older</Link>}
      </div>
    </DashPage>
  );
}
