import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export function Notice({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: "info" | "success" | "error" | "warning";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "bg-brand-50 text-brand-800",
    success: "bg-emerald-50 text-emerald-800",
    error: "bg-coral-soft text-coral",
    warning: "bg-sun-soft text-ink",
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;
  return (
    <div className={`flex gap-3 rounded-2xl px-4 py-3 text-sm ${styles} ${className}`} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-ink-muted">{sub}</p>}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-2xl border-0 bg-lavender px-4 py-3.5 text-base text-ink ring-1 ring-inset ring-transparent placeholder:text-ink-muted/70 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 font-semibold text-white shadow-fab transition hover:bg-brand-600 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-lavender px-5 py-3 font-semibold text-ink transition hover:bg-brand-50 active:scale-[.98] disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 font-semibold text-ink-soft transition hover:bg-lavender hover:text-ink disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-full bg-coral-soft px-5 py-3 font-semibold text-coral transition hover:bg-coral hover:text-white disabled:opacity-60",
  whatsapp:
    "inline-flex items-center justify-center gap-2.5 rounded-full bg-whatsapp px-6 py-4 text-lg font-bold text-white shadow-[0_12px_32px_-8px_rgba(37,211,102,.6)] transition hover:bg-whatsapp-dark active:scale-[.98]",
};

export function Field({
  label,
  htmlFor,
  hint,
  counter,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  counter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {counter}
      </div>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function CharCounter({ value, max }: { value: number; max: number }) {
  const left = max - value;
  return (
    <span className={`text-xs font-semibold tabular-nums ${left < 0 ? "text-coral" : left <= 10 ? "text-amber-600" : "text-ink-muted"}`} aria-live="polite">
      {value}/{max}
    </span>
  );
}
