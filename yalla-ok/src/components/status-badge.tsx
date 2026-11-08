import type { TaskStatus } from "@/lib/types";

const LABELS: Record<TaskStatus, { label: string; cls: string }> = {
  draft: { label: "Draft — awaiting payment", cls: "bg-ink/5 text-ink-soft" },
  pending_payment: { label: "Payment under review", cls: "bg-sun-soft text-amber-800" },
  pending_approval: { label: "Pending approval", cls: "bg-sun-soft text-amber-800" },
  active: { label: "Live", cls: "bg-emerald-50 text-emerald-700" },
  taken: { label: "Taken", cls: "bg-brand-50 text-brand-700" },
  expired: { label: "Expired", cls: "bg-ink/5 text-ink-muted" },
  rejected: { label: "Rejected", cls: "bg-coral-soft text-coral" },
};

export function StatusBadge({ status, short }: { status: TaskStatus; short?: boolean }) {
  const s = LABELS[status];
  const label = short && status === "draft" ? "Draft" : s.label;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{label}</span>;
}

/** A task whose deadline passed is expired even if the job hasn't run yet. */
export function effectiveStatus(t: { status: TaskStatus; expires_at: string | null }, now = Date.now()): TaskStatus {
  if (t.status === "active" && t.expires_at && new Date(t.expires_at).getTime() <= now) return "expired";
  return t.status;
}
