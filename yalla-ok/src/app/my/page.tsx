import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import type { Quota, Task, TaskStatus } from "@/lib/types";
import { formatMoney, timeAgo, durationLabel } from "@/lib/format";
import { taskImageUrl } from "@/lib/env";
import { Countdown } from "@/components/countdown";
import { StatusBadge, effectiveStatus } from "@/components/status-badge";
import { Notice, PageTitle, buttonClass } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { MarkTakenButton } from "./mark-taken-button";
import { discardDraftAction } from "./actions";

export const metadata: Metadata = { title: "My Tasks", robots: { index: false } };
export const dynamic = "force-dynamic";

const WAITING: TaskStatus[] = ["draft", "pending_payment", "pending_approval"];
const HISTORY: TaskStatus[] = ["taken", "expired", "rejected"];

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const { supabase, user } = await requireUser("/my");
  const sp = await searchParams;
  const [{ data }, { data: quota }] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    supabase.rpc("my_posting_quota").maybeSingle<Quota>(),
  ]);
  const now = Date.now();
  const tasks = ((data ?? []) as Task[]).map((t) => ({ ...t, status: effectiveStatus(t, now) }));
  const live = tasks.filter((t) => t.status === "active");
  const waiting = tasks.filter((t) => WAITING.includes(t.status));
  const history = tasks.filter((t) => HISTORY.includes(t.status));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle sub="Everything you’ve posted, live and past.">My Tasks</PageTitle>
        <Link href="/post" className={`${buttonClass.primary} hidden md:inline-flex`}>
          <Plus className="h-5 w-5" aria-hidden /> Post a Task
        </Link>
      </div>

      {sp.posted === "pending_approval" && (
        <Notice tone="success" title="Task received" className="mb-5">
          It’s waiting for a quick review. Once approved, it goes live and the countdown starts.
        </Notice>
      )}

      {quota && quota.fee_cents > 0 && (
        <div className="mb-8 flex items-center justify-between gap-4 rounded-3xl bg-lavender px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              {quota.free_left > 0
                ? `${quota.free_left} of ${quota.free_total} free posts left`
                : `Free posts used (${quota.free_used})`}
            </p>
            <p className="text-xs text-ink-muted">After that, each task is {formatMoney(quota.fee_cents, quota.currency)} via Whish.</p>
          </div>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: Math.min(quota.free_total, 10) }, (_, i) => (
              <span key={i} className={`h-2.5 w-6 rounded-full ${i < quota.free_left ? "bg-brand-500" : "bg-brand-200"}`} />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-4xl bg-lavender px-6 py-14 text-center">
          <h2 className="text-lg font-bold">You haven’t posted anything yet</h2>
          <p className="mt-1 text-sm text-ink-muted">Describe a task, set a reward and a deadline. That’s it.</p>
          <Link href="/post" className={`${buttonClass.primary} mt-6`}>
            <Plus className="h-5 w-5" aria-hidden /> Post your first task
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          <Section title="Live now" tasks={live} empty="Nothing live right now." />
          {waiting.length > 0 && <Section title="Waiting" tasks={waiting} />}
          {history.length > 0 && <Section title="History" tasks={history} />}
        </div>
      )}
    </div>
  );
}

function Section({ title, tasks, empty }: { title: string; tasks: Task[]; empty?: string }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-muted">
        {title} <span className="tabular-nums">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/10 px-5 py-6 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <MyTaskRow task={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyTaskRow({ task }: { task: Task }) {
  const img = taskImageUrl(task.image_path, "sm");
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink/5 sm:p-5">
      <div className="flex gap-4">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-lavender text-lg font-extrabold text-brand-500">
            {formatMoney(task.reward_cents)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            {task.status === "active" && task.expires_at && <Countdown expiresAt={task.expires_at} />}
          </div>
          <Link href={`/t/${task.id}`} className="mt-1.5 block truncate font-bold text-ink hover:text-brand-600">
            {img && <span className="text-brand-500">{formatMoney(task.reward_cents)} · </span>}
            {task.headline}
          </Link>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> {task.location} · {durationLabel(task.duration_minutes)} ·{" "}
            {task.status === "taken" ? `taken ${timeAgo(task.taken_at)}` : `posted ${timeAgo(task.published_at ?? task.created_at)}`}
          </p>
        </div>
      </div>

      {task.rejection_reason && (task.status === "draft" || task.status === "rejected") && (
        <p className="mt-3 rounded-2xl bg-coral-soft px-3 py-2 text-xs font-medium text-coral">{task.rejection_reason}</p>
      )}

      {(task.status === "active" || task.status === "draft" || task.status === "pending_payment") && (
        <div className="mt-4 flex flex-wrap gap-2">
          {task.status === "active" && <MarkTakenButton taskId={task.id} compact />}
          {task.status === "draft" && (
            <>
              <Link href={`/pay/${task.id}`} className={`${buttonClass.primary} px-5 py-2 text-sm`}>
                Pay {formatMoney(task.fee_cents)} to publish
              </Link>
              <ActionForm action={discardDraftAction} confirm="Discard this draft?">
                <input type="hidden" name="task_id" value={task.id} />
                <SubmitButton className={`${buttonClass.ghost} py-2 text-sm`}>Discard</SubmitButton>
              </ActionForm>
            </>
          )}
          {task.status === "pending_payment" && (
            <Link href={`/pay/${task.id}`} className={`${buttonClass.secondary} px-4 py-2 text-sm`}>
              View payment
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
