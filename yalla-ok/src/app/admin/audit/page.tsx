import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

type Row = {
  id: number;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  admin: { display_name: string; email: string | null } | null;
};

export default async function AuditPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("admin_audit_logs")
    .select("*, admin:profiles!admin_audit_logs_admin_id_fkey(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Audit log</h1>
        <p className="text-sm text-ink-muted">Every payment decision and admin change, newest first. Entries can’t be edited.</p>
      </div>
      <div className="overflow-x-auto rounded-3xl bg-white shadow-card ring-1 ring-ink/5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-lavender text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDateTime(r.created_at)}</td>
                <td className="px-4 py-3">{r.admin?.display_name ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs font-semibold">{r.action}</td>
                <td className="px-4 py-3">
                  <code className="block max-w-xl whitespace-pre-wrap break-all text-xs text-ink-soft">
                    {JSON.stringify({ target: `${r.target_type}:${r.target_id}`, ...r.details })}
                  </code>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                  No admin actions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
