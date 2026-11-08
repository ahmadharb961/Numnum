import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney, durationLabel } from "@/lib/format";
import type { Task, TaskStatus } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge, effectiveStatus } from "@/components/status-badge";
import { DemoBadge } from "@/components/task-card";
import { buttonClass, inputClass } from "@/components/ui";
import { approveTaskAction, deleteTaskAction, editTaskAction, rejectTaskAction } from "../actions";
import { FilterTabs } from "../filter-tabs";

export const metadata = { title: "Tasks" };

const TABS = [
  ["pending_approval", "Pending approval"],
  ["active", "Active"],
  ["pending_payment", "Pending payment"],
  ["draft", "Drafts"],
  ["taken", "Taken"],
  ["expired", "Expired"],
  ["rejected", "Rejected"],
  ["all", "All"],
] as const;

type Row = Task & { owner: { display_name: string; email: string | null } | null; contact: { whatsapp: string } | null };

export default async function AdminTasksPage({ searchParams }: { searchParams: Promise<{ status?: string; user?: string }> }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const status = TABS.some(([v]) => v === sp.status) ? sp.status! : "pending_approval";
  const userFilter = sp.user && /^[0-9a-f-]{36}$/i.test(sp.user) ? sp.user : null;

  let q = supabase
    .from("tasks")
    .select("*, owner:profiles!tasks_user_id_fkey(display_name, email), contact:task_contacts(whatsapp)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") q = q.eq("status", status as TaskStatus);
  if (userFilter) q = q.eq("user_id", userFilter);
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  const ids = rows.map((r) => r.id);
  const reports = new Map<string, number>();
  if (ids.length) {
    const { data: rep } = await supabase.from("task_reports").select("task_id").eq("status", "open").in("task_id", ids);
    for (const r of rep ?? []) reports.set(r.task_id, (reports.get(r.task_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Tasks</h1>
        {userFilter && (
          <p className="text-sm text-ink-muted">
            Showing one user’s tasks ·{" "}
            <Link href={`/admin/tasks?status=${status}`} className="font-semibold text-brand-600">
              clear
            </Link>
          </p>
        )}
      </div>
      <FilterTabs base="/admin/tasks" current={status} options={TABS} extra={userFilter ? `&user=${userFilter}` : ""} />

      {rows.length === 0 ? (
        <p className="rounded-3xl bg-lavender px-5 py-10 text-center text-ink-muted">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => {
            const st = effectiveStatus(t);
            const contact = Array.isArray(t.contact) ? t.contact[0] : t.contact;
            return (
              <li key={t.id} className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink/5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={st} short />
                  {t.is_demo && <DemoBadge />}
                  {t.is_free ? (
                    <span className="text-xs font-semibold text-ink-muted">Free post</span>
                  ) : (
                    <span className="text-xs font-semibold text-ink-muted">Paid listing ({formatMoney(t.fee_cents)})</span>
                  )}
                  {(reports.get(t.id) ?? 0) > 0 && (
                    <Link href="/admin/reports" className="rounded-full bg-coral-soft px-2 py-0.5 text-xs font-bold text-coral">
                      {reports.get(t.id)} open report{reports.get(t.id)! > 1 ? "s" : ""}
                    </Link>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-xl font-extrabold text-brand-600">{formatMoney(t.reward_cents)}</span>
                  <Link href={`/t/${t.id}`} target="_blank" className="font-bold hover:text-brand-600">
                    {t.headline} <ExternalLink className="inline h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{t.description}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  {t.location} · {durationLabel(t.duration_minutes)} · by{" "}
                  {t.user_id ? (
                    <Link href={`/admin/tasks?status=all&user=${t.user_id}`} className="font-semibold text-ink-soft hover:text-brand-600">
                      {t.owner?.display_name ?? t.poster_name}
                    </Link>
                  ) : (
                    t.poster_name
                  )}{" "}
                  {t.owner?.email && <>({t.owner.email})</>} · WhatsApp {contact?.whatsapp ?? "—"} · created {formatDateTime(t.created_at)}
                  {t.expires_at && <> · ends {formatDateTime(t.expires_at)}</>}
                </p>
                {t.flagged_reason && <p className="mt-2 text-sm font-semibold text-amber-700">Flag: {t.flagged_reason}</p>}
                {t.rejection_reason && <p className="mt-2 text-sm text-coral">Reason: {t.rejection_reason}</p>}

                <div className="mt-4 flex flex-wrap items-start gap-2">
                  {t.status === "pending_approval" && (
                    <ActionForm action={approveTaskAction}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <SubmitButton className={`${buttonClass.primary} py-2 text-sm`} pendingText="Approving…">
                        Approve & publish
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {t.status !== "rejected" && (
                    <details className="group">
                      <summary className={`${buttonClass.danger} cursor-pointer list-none py-2 text-sm`}>Reject…</summary>
                      <ActionForm action={rejectTaskAction} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="task_id" value={t.id} />
                        <input name="reason" required maxLength={300} placeholder="Reason shown to the poster" className={`${inputClass} py-2 sm:w-72`} />
                        <SubmitButton className={`${buttonClass.danger} py-2 text-sm`}>Confirm reject</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                  <details>
                    <summary className={`${buttonClass.secondary} cursor-pointer list-none py-2 text-sm`}>Edit…</summary>
                    <ActionForm action={editTaskAction} className="mt-2 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                      <input type="hidden" name="task_id" value={t.id} />
                      <input name="headline" defaultValue={t.headline} maxLength={50} required className={`${inputClass} py-2 sm:col-span-2`} aria-label="Headline" />
                      <input name="description" defaultValue={t.description} maxLength={120} required className={`${inputClass} py-2 sm:col-span-2`} aria-label="Description" />
                      <input name="reward" defaultValue={(t.reward_cents / 100).toString()} inputMode="decimal" required className={`${inputClass} py-2`} aria-label="Reward (USD)" />
                      <input name="location" defaultValue={t.location} maxLength={60} required className={`${inputClass} py-2`} aria-label="Location" />
                      <SubmitButton className={`${buttonClass.primary} py-2 text-sm sm:col-span-2`}>Save changes</SubmitButton>
                    </ActionForm>
                  </details>
                  <ActionForm action={deleteTaskAction} confirm="Permanently remove this task? Paid listings can only be rejected.">
                    <input type="hidden" name="task_id" value={t.id} />
                    <SubmitButton className={`${buttonClass.ghost} py-2 text-sm`}>Remove</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
