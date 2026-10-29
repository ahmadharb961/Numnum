import { BadgeCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerifiedBadge({ className, label = false }: { className?: string; label?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sky-500", className)} title="Verified business identity">
      <BadgeCheck className="h-4 w-4 fill-sky-500 text-white" aria-label="Verified restaurant" />
      {label && <span className="text-xs font-semibold">Verified</span>}
    </span>
  );
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-black/10 text-black/10"} />
      ))}
    </span>
  );
}

export function RatingPill({ avg, count, dark }: { avg: number; count: number; dark?: boolean }) {
  if (!count) return <span className={cn("text-xs", dark ? "text-white/70" : "text-ink-muted")}>New</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", dark ? "text-white" : "text-ink")}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {avg.toFixed(1)}
      <span className={dark ? "font-normal text-white/70" : "font-normal text-ink-muted"}>({count})</span>
    </span>
  );
}

const badgeTones = {
  gray: "bg-black/5 text-ink-soft",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-700",
  brand: "bg-brand-50 text-brand-700",
  purple: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof badgeTones; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-black/[0.06]", className)} />;
}

export function Alert({ tone = "amber", children, className }: { tone?: "amber" | "red" | "green" | "blue"; children: React.ReactNode; className?: string }) {
  const tones = { amber: "bg-amber-50 text-amber-900 border-amber-200", red: "bg-red-50 text-red-800 border-red-200", green: "bg-emerald-50 text-emerald-800 border-emerald-200", blue: "bg-sky-50 text-sky-900 border-sky-200" };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "brand" | "green" | "red" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={cn("tabular mt-1 text-2xl font-extrabold", tone === "brand" && "text-brand-600", tone === "green" && "text-emerald-600", tone === "red" && "text-red-600")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
