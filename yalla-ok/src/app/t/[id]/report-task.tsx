"use client";

import { useActionState, useState } from "react";
import { Flag, X } from "lucide-react";
import { reportTaskAction } from "./actions";
import { buttonClass, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const REASONS = [
  ["scam", "Scam or fraud"],
  ["spam", "Spam"],
  ["inappropriate", "Inappropriate"],
  ["illegal", "Illegal or dangerous"],
  ["duplicate", "Duplicate listing"],
  ["other", "Something else"],
] as const;

export function ReportTask({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(reportTaskAction, null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-coral-soft hover:text-coral"
      >
        <Flag className="h-4 w-4" aria-hidden /> Report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md animate-card-in rounded-t-4xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift sm:rounded-4xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="report-title" className="text-lg font-bold">
                Report this task
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-lavender" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            {state?.ok ? (
              <div className="space-y-4">
                <p className="text-ink-soft">{state.ok}</p>
                <button type="button" className={`${buttonClass.secondary} w-full`} onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            ) : (
              <form action={action} className="space-y-4">
                <input type="hidden" name="task_id" value={taskId} />
                <fieldset className="grid grid-cols-2 gap-2">
                  <legend className="sr-only">Reason</legend>
                  {REASONS.map(([value, label], i) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-2xl bg-lavender px-3 py-3 text-sm font-medium has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 has-[:checked]:ring-2 has-[:checked]:ring-brand-500"
                    >
                      <input type="radio" name="reason" value={value} defaultChecked={i === 0} className="accent-brand-500" />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <textarea name="details" maxLength={300} rows={3} placeholder="Anything we should know? (optional)" className={inputClass} />
                {state?.error && <p className="text-sm font-medium text-coral">{state.error}</p>}
                <SubmitButton className={`${buttonClass.danger} w-full`} pendingText="Sending…">
                  Send report
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
