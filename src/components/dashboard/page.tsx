"use client";

import { useT } from "@/i18n/client";

const tr = (t: (s: string) => string, n: React.ReactNode) => (typeof n === "string" ? t(n) : n);

export function DashPage({ title, description, actions, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 lg:px-8 lg:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">{t(title)}</h1>
          {description && <div className="mt-1 text-sm text-ink-muted">{tr(t, description)}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, description, children, actions, id }: { title: string; description?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  const t = useT();
  return (
    <section id={id} className="card mb-5 scroll-mt-20 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold">{t(title)}</h2>
          {description && <div className="mt-0.5 text-sm text-ink-muted">{tr(t, description)}</div>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
