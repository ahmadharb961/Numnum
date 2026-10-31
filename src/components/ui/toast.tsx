"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Action = { label: string; href: string };
type Toast = { id: number; message: string; tone: "default" | "error" | "success"; action?: Action };
const Ctx = createContext<(message: string, tone?: Toast["tone"], action?: Action) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const t = useT(); // messages (including ones from the server) are translated when shown
  const push = useCallback((message: string, tone: Toast["tone"] = "default", action?: Action) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 4500 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4" style={{ paddingTop: "calc(var(--safe-top) + 12px)" }} aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={cn("flex animate-fade-in items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg", x.tone === "error" ? "bg-red-600 text-white" : x.tone === "success" ? "bg-emerald-600 text-white" : "bg-ink text-white", x.action && "pointer-events-auto")}>
            {t(x.message)}
            {x.action && (
              <Link href={x.action.href} onClick={() => setToasts((all) => all.filter((y) => y.id !== x.id))} className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30">
                {t(x.action.label)}
              </Link>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
