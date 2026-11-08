import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";

export function AuthShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-4 sm:py-10">
      <div className="rounded-4xl bg-white p-6 shadow-lift ring-1 ring-ink/5 sm:p-9">
        <LogoMark className="h-12 w-12" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-ink-muted">{sub}</p>
        <div className="mt-7">{children}</div>
      </div>
    </div>
  );
}
