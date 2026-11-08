import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass, inputClass } from "@/components/ui";
import { rejectTaskAction, resolveReportAction } from "../actions";
import { FilterTabs } from "../filter-tabs";

export const metadata = { title: "Reports" };

const TABS = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["dismissed", "Dismissed"],
] as const;

type Row = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_id: string | null;
  task: { id: string; headline: string; reward_cents: number; status: TaskStatus; poster_name: string } | null;
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const status = TABS.some(([v]) => v === sp.status) ? sp.status! : "open";
  const { data } = await supabase
    .from("task_reports")
    .select("id, reason, details, status, created_at, reporter_id, task:tasks(id, headline, reward_cents, status, poster_name)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>
        <p className="text-sm text-ink-muted">Three reports from different people automatically pull a task off the feed for review.</p>
      </div>
      <FilterTabs base="/admin/reports" current={status} options={TABS} />
      {rows.length === 0 ? (
        <p className="rounded-3xl bg-lavender px-5 py-10 text-center text-ink-muted">No {status} reports.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink/5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-coral-soft px-2.5 py-1 text-xs font-bold uppercase text-coral">{r.reason}</span>
                <span className="text-xs text-ink-muted">
                  {formatDateTime(r.created_at)} · {r.reporter_id ? "signed-in user" : "visitor"}
                </span>
              </div>
              {r.details && <p className="mt-2 text-sm">“{r.details}”</p>}
              {r.task && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge status={r.task.status} short />
                  <Link href={`/t/${r.task.id}`} target="_blank" className="font-semibold hover:text-brand-600">
                    {formatMoney(r.task.reward_cents)} · {r.task.headline}
                  </Link>
                  <span className="text-ink-muted">by {r.task.poster_name}</span>
                </p>
              )}
              {r.status === "open" && (
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  <ActionForm action={resolveReportAction}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <SubmitButton name="status" value="dismissed" className={`${buttonClass.secondary} py-2 text-sm`}>
                      Dismiss
                    </SubmitButton>
                  </ActionForm>
                  {r.task && r.task.status !== "rejected" && (
                    <ActionForm action={rejectTaskAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="task_id" value={r.task.id} />
                      <input name="reason" required defaultValue={`Removed after report: ${r.reason}`} className={`${inputClass} py-2 sm:w-72`} aria-label="Reason" />
                      <SubmitButton className={`${buttonClass.danger} py-2 text-sm`}>Take task down</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
