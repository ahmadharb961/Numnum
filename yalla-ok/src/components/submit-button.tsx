"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { usePendingForm } from "@/components/action-form";
import { useHydrated } from "@/components/use-hydrated";

export function SubmitButton({
  children,
  pendingText,
  className,
  name,
  value,
  pending: forced,
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  className: string;
  name?: string;
  value?: string;
  pending?: boolean;
}) {
  const status = useFormStatus();
  const ctx = usePendingForm();
  // Until React is ready, a click would submit the form natively (values in the URL).
  const hydrated = useHydrated();
  const pending = forced ?? (ctx ? ctx.pending : status.pending);
  // When several buttons share a form, only the one that was pressed spins.
  const mine = pending && (!name || (ctx ? ctx.submitter === `${name}=${value}` : status.data?.get(name) === value));
  return (
    <button type="submit" className={className} disabled={pending || !hydrated} name={name} value={value} aria-busy={mine}>
      {mine && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {mine && pendingText ? pendingText : children}
    </button>
  );
}
