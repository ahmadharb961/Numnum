"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function PageHeader({ title, back = true, right, sub }: { title: string; back?: boolean; right?: React.ReactNode; sub?: string }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-cream/90 backdrop-blur-xl" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="container-app flex h-14 items-center gap-2">
        {back && (
          <button onClick={() => (history.length > 1 ? router.back() : router.push("/"))} className="-ml-2 grid h-10 w-10 place-items-center rounded-full active:bg-black/5" aria-label="Back">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold tracking-tight">{title}</h1>
          {sub && <p className="-mt-0.5 truncate text-xs text-ink-muted">{sub}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
