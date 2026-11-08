"use client";

import { createContext, startTransition, useActionState, useContext, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/types";

type Pending = { pending: boolean; submitter: string | null };
const PendingContext = createContext<Pending | null>(null);
export const usePendingForm = () => useContext(PendingContext);

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((state: ActionState) => ReactNode);
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
};

/**
 * A form for a server action that shows its pending state and result inline.
 * Submits manually (instead of `<form action>`) so typed values survive an error.
 */
export function ActionForm({ action, children, className, confirm, resetOnSuccess }: Props) {
  const [state, run, pending] = useActionState(action, null);
  const [submitter, setSubmitter] = useState<string | null>(null);

  return (
    <form
      method="post"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const form = e.currentTarget;
        const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const data = new FormData(form);
        if (button?.name) data.set(button.name, button.value);
        setSubmitter(button?.name ? `${button.name}=${button.value}` : null);
        startTransition(() => run(data));
        if (resetOnSuccess) {
          // Cleared optimistically; on error the message explains what to retype.
          form.reset();
        }
      }}
    >
      <PendingContext.Provider value={{ pending, submitter }}>
        <fieldset disabled={pending} className="contents">
          {typeof children === "function" ? children(state) : children}
        </fieldset>
      </PendingContext.Provider>
      {!pending && state?.error && (
        <p className="mt-2 w-full basis-full text-sm font-medium text-coral" role="alert">
          {state.error}
        </p>
      )}
      {!pending && state?.ok && (
        <p className="mt-2 w-full basis-full text-sm font-medium text-emerald-700" role="status">
          {state.ok}
        </p>
      )}
    </form>
  );
}
