"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Mobile bottom sheet; centered dialog on larger screens. */
export function Sheet({ open, onClose, title, children, className, full }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string; full?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title ? t(title) : undefined}>
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          "relative flex w-full max-w-screen-sm animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-white text-ink shadow-2xl outline-none sm:rounded-3xl",
          full ? "h-[92dvh]" : "max-h-[92dvh]",
          className,
        )}
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-black/15 sm:hidden" />
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-black/5 px-5 pb-3 pt-5">
            <h2 className="text-lg font-bold">{title ? t(title) : null}</h2>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-black/5" aria-label={t("Close")}>
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {title === undefined && (
          // Untitled sheets (e.g. a dish with its photo on top) get a floating close button.
          <button onClick={onClose} className="absolute end-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur hover:bg-black/65" aria-label={t("Close")}>
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
