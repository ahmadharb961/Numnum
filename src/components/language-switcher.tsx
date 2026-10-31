"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { setLocaleAction } from "@/actions/locale";
import { useLocale } from "@/i18n/client";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
] as const;

/** English / العربية toggle. Saves the choice (device + account) and reloads in the new direction. */
export function LanguageSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const locale = useLocale();
  const [pending, start] = useTransition();
  const pick = (v: string) =>
    v !== locale &&
    start(async () => {
      await setLocaleAction(v);
      window.location.reload();
    });
  if (compact)
    return (
      <button type="button" onClick={() => pick(locale === "ar" ? "en" : "ar")} disabled={pending} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-sm font-semibold", className)} aria-label="Change language">
        <Languages className="h-4 w-4" /> {locale === "ar" ? "English" : "العربية"}
      </button>
    );
  return (
    <div className={cn("inline-grid grid-cols-2 rounded-xl bg-black/5 p-1 text-sm font-semibold", pending && "opacity-60", className)} role="radiogroup" aria-label="Language">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={locale === o.value} onClick={() => pick(o.value)} className={cn("h-9 rounded-lg px-4 transition", locale === o.value ? "bg-white shadow-sm" : "text-ink-muted")} lang={o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
