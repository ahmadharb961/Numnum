import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { Notice } from "@/components/ui";

type Stats = {
  users: number;
  active_tasks: number;
  tasks_today: number;
  taken_tasks: number;
  expired_tasks: number;
  pending_approval: number;
  pending_payments: number;
  open_reports: number;
  paid_postings: number;
  revenue: Record<string, number>;
  revenue_today: Record<string, number>;
};

function money(map: Record<string, number>) {
  const entries = Object.entries(map);
  if (entries.length === 0) return formatMoney(0);
  return entries.map(([cur, cents]) => formatMoney(cents, cur)).join(" + ");
}

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_stats");
  if (error || !data) return <Notice tone="error">Couldn’t load stats.</Notice>;
  const s = data as Stats;

  const cards: { label: string; value: string | number; href?: string; highlight?: boolean }[] = [
    { label: "Verified revenue", value: money(s.revenue), highlight: true },
    { label: "Revenue today", value: money(s.revenue_today) },
    { label: "Paid postings", value: s.paid_postings },
    { label: "Pending payments", value: s.pending_payments, href: "/admin/payments", highlight: s.pending_payments > 0 },
    { label: "Active tasks", value: s.active_tasks, href: "/admin/tasks?status=active" },
    { label: "Tasks posted today", value: s.tasks_today, href: "/admin/tasks?status=all" },
    { label: "Waiting for approval", value: s.pending_approval, href: "/admin/tasks?status=pending_approval", highlight: s.pending_approval > 0 },
    { label: "Open reports", value: s.open_reports, href: "/admin/reports", highlight: s.open_reports > 0 },
    { label: "Marked taken", value: s.taken_tasks, href: "/admin/tasks?status=taken" },
    { label: "Expired", value: s.expired_tasks, href: "/admin/tasks?status=expired" },
    { label: "Registered users", value: s.users, href: "/admin/users" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Overview</h1>
        <p className="text-sm text-ink-muted">
          Revenue counts only listing fees you’ve verified in Whish. Task rewards are paid between users and never pass through Yalla Ok.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => {
          const inner = (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{c.label}</p>
              <p className={`mt-2 text-2xl font-extrabold tabular-nums sm:text-3xl ${c.highlight ? "text-brand-600" : "text-ink"}`}>{c.value}</p>
            </>
          );
          const cls = `rounded-3xl bg-white p-4 shadow-card ring-1 sm:p-5 ${c.highlight ? "ring-brand-200" : "ring-ink/5"}`;
          return c.href ? (
            <Link key={c.label} href={c.href} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-lift`}>
              {inner}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
