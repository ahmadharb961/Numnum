import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Hourglass } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import type { PaymentSubmission, Task } from "@/lib/types";
import { formatMoney, durationLabel, formatDateTime } from "@/lib/format";
import { Notice, PageTitle, buttonClass } from "@/components/ui";
import { CopyText } from "@/components/copy-text";
import { PayForm } from "./pay-form";

export const metadata: Metadata = { title: "Pay listing fee", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser(`/pay/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: taskRow }, { data: subs }, settings] = await Promise.all([
    supabase.from("tasks").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("payment_submissions").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    getSettings(),
  ]);
  const task = taskRow as Task | null;
  if (!task) notFound();
  if (task.status === "active") redirect(`/t/${task.id}`);

  const submissions = (subs ?? []) as PaymentSubmission[];
  const latest = submissions[0];
  const fee = formatMoney(task.fee_cents, settings.currency);

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle sub="Your listing fee goes to Yalla Ok. The reward is between you and whoever does the task.">
        {task.status === "pending_payment" ? "Payment submitted" : "Pay the listing fee"}
      </PageTitle>

      <div className="mb-6 flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink/5">
        <div className="flex h-14 min-w-[4.5rem] items-center justify-center rounded-2xl bg-lavender px-3 text-xl font-extrabold text-brand-500">
          {formatMoney(task.reward_cents)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">{task.headline}</p>
          <p className="text-sm text-ink-muted">
            {task.location} · live for {durationLabel(task.duration_minutes)} once published
          </p>
        </div>
      </div>

      {task.status === "pending_payment" ? (
        <div className="rounded-4xl bg-lavender p-6 text-center sm:p-8">
          <Hourglass className="mx-auto h-12 w-12 text-brand-500" aria-hidden />
          <h2 className="mt-4 text-xl font-extrabold">We’re checking your Whish payment</h2>
          <p className="mx-auto mt-2 max-w-sm text-ink-soft">
            As soon as we confirm the {formatMoney(latest?.amount_cents ?? task.fee_cents, latest?.currency)} transfer in Whish,
            your task goes live and its {durationLabel(task.duration_minutes)} countdown starts.
          </p>
          {latest && (
            <p className="mt-4 text-sm text-ink-muted">
              Reference <span className="font-mono font-semibold text-ink">{latest.reference}</span> · sent{" "}
              {formatDateTime(latest.created_at)}
            </p>
          )}
          <Link href="/my" className={`${buttonClass.secondary} mt-6`}>
            Go to My Tasks
          </Link>
        </div>
      ) : task.status === "draft" ? (
        <>
          {task.rejection_reason && (
            <Notice tone="error" title="Your last payment couldn’t be confirmed" className="mb-5">
              {task.rejection_reason.replace(/^Payment not confirmed: /, "")}
            </Notice>
          )}

          <ol className="space-y-5">
            <li className="rounded-4xl bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white shadow-lift">
              <p className="text-sm font-semibold text-white/75">Step 1 · Send with Whish Money</p>
              <p className="mt-2 text-5xl font-extrabold tracking-tight">{fee}</p>
              <div className="mt-5 space-y-3 rounded-3xl bg-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-white/70">Whish number</p>
                    <p className="text-lg font-bold tabular-nums">{settings.whish_number || "Not set yet"}</p>
                  </div>
                  {settings.whish_number && <CopyText text={settings.whish_number} />}
                </div>
                <div>
                  <p className="text-xs text-white/70">Account name</p>
                  <p className="font-semibold">{settings.whish_account_name}</p>
                </div>
              </div>
              {settings.payment_instructions && (
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-white/85">{settings.payment_instructions}</p>
              )}
            </li>

            <li className="rounded-4xl bg-white p-6 shadow-card ring-1 ring-ink/5">
              <p className="mb-4 text-sm font-semibold text-ink-muted">Step 2 · Tell us it’s sent</p>
              <PayForm taskId={task.id} />
            </li>
          </ol>
        </>
      ) : (
        <Notice tone="info" title="This task doesn’t need a payment">
          <Link href={`/t/${task.id}`} className="font-semibold underline">
            View the task
          </Link>
        </Notice>
      )}

      {submissions.length > 0 && (
        <details className="mt-8 rounded-3xl bg-lavender px-5 py-4 text-sm">
          <summary className="cursor-pointer font-semibold">Payment history ({submissions.length})</summary>
          <ul className="mt-3 space-y-2">
            {submissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span className="font-mono">{s.reference}</span>
                <span className="flex items-center gap-1.5 text-ink-muted">
                  {s.status === "approved" && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />}
                  {s.status} · {formatDateTime(s.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
