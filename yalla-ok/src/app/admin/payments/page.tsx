import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { PaymentSubmission, TaskStatus } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass, inputClass } from "@/components/ui";
import { reviewPaymentAction } from "../actions";
import { FilterTabs } from "../filter-tabs";

export const metadata = { title: "Payments" };

type Row = PaymentSubmission & {
  task: { id: string; headline: string; reward_cents: number; status: TaskStatus; flagged_reason: string | null } | null;
  user: { display_name: string; email: string | null; status: string } | null;
};

const TABS = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase, user: me } = await requireAdmin();
  const sp = await searchParams;
  const status = TABS.some(([v]) => v === sp.status) ? sp.status! : "pending";

  const { data } = await supabase
    .from("payment_submissions")
    .select(
      "*, task:tasks(id, headline, reward_cents, status, flagged_reason), user:profiles!payment_submissions_user_id_fkey(display_name, email, status)",
    )
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" })
    .limit(100);
  const rows = (data ?? []) as Row[];

  // Duplicate reference detection across all submissions and verified payments.
  const refs = [...new Set(rows.map((r) => r.reference_normalized))];
  const dupes = new Map<string, number>();
  const used = new Set<string>();
  if (refs.length) {
    const [{ data: same }, { data: verified }] = await Promise.all([
      supabase.from("payment_submissions").select("id, reference_normalized").in("reference_normalized", refs),
      supabase.from("verified_payments").select("reference_normalized, submission_id").in("reference_normalized", refs),
    ]);
    for (const s of same ?? []) dupes.set(s.reference_normalized, (dupes.get(s.reference_normalized) ?? 0) + 1);
    for (const v of verified ?? []) used.add(`${v.reference_normalized}|${v.submission_id}`);
  }
  const usedElsewhere = (r: Row) =>
    [...used].some((k) => k.startsWith(r.reference_normalized + "|") && !k.endsWith("|" + r.id));

  // Short-lived links to private screenshots.
  const shots = new Map<string, string>();
  const paths = rows.map((r) => r.screenshot_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { data: signed } = await createAdminClient().storage.from("payment-proofs").createSignedUrls(paths, 600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) shots.set(s.path, s.signedUrl);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Whish payments</h1>
        <p className="text-sm text-ink-muted">
          Open the Whish account and find each transfer before approving. A reference or screenshot alone is not proof of payment.
        </p>
      </div>
      <FilterTabs base="/admin/payments" current={status} options={TABS} />

      {rows.length === 0 ? (
        <p className="rounded-3xl bg-lavender px-5 py-10 text-center text-ink-muted">No {status} payments.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const dupeCount = (dupes.get(r.reference_normalized) ?? 1) - 1;
            const already = usedElsewhere(r);
            const own = r.user_id === me.id;
            return (
              <li key={r.id} className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink/5">
                <div className="flex flex-col gap-5 lg:flex-row">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="text-2xl font-extrabold text-brand-600">{formatMoney(r.amount_cents, r.currency)}</span>
                      <span className="font-mono text-lg font-semibold">{r.reference}</span>
                      <span className="text-sm text-ink-muted">{formatDateTime(r.created_at)}</span>
                    </div>

                    {(dupeCount > 0 || already) && (
                      <p className="flex items-center gap-2 rounded-2xl bg-coral-soft px-3 py-2 text-sm font-semibold text-coral">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        {already
                          ? "This reference already paid for another listing."
                          : `Same reference used in ${dupeCount} other submission${dupeCount > 1 ? "s" : ""}.`}
                      </p>
                    )}

                    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-ink-muted">Task</dt>
                        <dd className="flex flex-wrap items-center gap-2 font-semibold">
                          {r.task ? (
                            <>
                              <Link href={`/t/${r.task.id}`} className="hover:text-brand-600" target="_blank">
                                {r.task.headline} <ExternalLink className="inline h-3.5 w-3.5" aria-hidden />
                              </Link>
                              <StatusBadge status={r.task.status} short />
                            </>
                          ) : (
                            "Deleted"
                          )}
                        </dd>
                        {r.task?.flagged_reason && <dd className="mt-1 text-xs font-medium text-amber-700">Flag: {r.task.flagged_reason}</dd>}
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Paid by</dt>
                        <dd className="font-semibold">
                          {r.user?.display_name ?? "—"} <span className="font-normal text-ink-muted">{r.user?.email}</span>
                        </dd>
                      </div>
                    </dl>

                    {r.review_note && <p className="text-sm text-ink-soft">Note: {r.review_note}</p>}
                    {r.reviewed_at && <p className="text-xs text-ink-muted">Reviewed {formatDateTime(r.reviewed_at)}</p>}

                    {r.status === "pending" &&
                      (own ? (
                        <p className="text-sm font-medium text-amber-700">This is your own payment — another admin must review it.</p>
                      ) : (
                        <ActionForm action={reviewPaymentAction} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <input type="hidden" name="submission_id" value={r.id} />
                          <input name="note" placeholder="Note (required to reject)" className={`${inputClass} py-2.5 sm:max-w-xs`} maxLength={500} />
                          <SubmitButton name="decision" value="approve" className={`${buttonClass.primary} py-2.5`} pendingText="Approving…">
                            Verified in Whish — approve
                          </SubmitButton>
                          <SubmitButton name="decision" value="reject" className={`${buttonClass.danger} py-2.5`} pendingText="Rejecting…">
                            Reject
                          </SubmitButton>
                        </ActionForm>
                      ))}
                  </div>

                  {r.screenshot_path && (
                    <a
                      href={shots.get(r.screenshot_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full shrink-0 overflow-hidden rounded-2xl bg-lavender lg:w-48"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shots.get(r.screenshot_path)} alt="Payment screenshot" className="max-h-72 w-full object-contain" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
