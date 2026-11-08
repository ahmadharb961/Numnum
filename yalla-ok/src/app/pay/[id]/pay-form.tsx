"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { submitPaymentAction } from "./actions";

export function PayForm({ taskId }: { taskId: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <ActionForm action={submitPaymentAction} className="space-y-5">
      <input type="hidden" name="task_id" value={taskId} />
      <Field label="Whish transaction reference" htmlFor="reference" hint="You’ll find it in the Whish app under the transfer details.">
        <input
          id="reference"
          name="reference"
          required
          minLength={3}
          maxLength={80}
          placeholder="e.g. 4829 1734 0021"
          className={`${inputClass} font-mono`}
          autoComplete="off"
          autoCapitalize="characters"
        />
      </Field>

      <div className="space-y-2">
        <span className="text-sm font-semibold">
          Screenshot <span className="font-normal text-ink-muted">(optional, helps us find it faster)</span>
        </span>
        <label
          htmlFor="screenshot"
          className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-brand-200 bg-lavender/60 px-4 py-4 text-sm font-semibold text-brand-600 transition hover:border-brand-400"
        >
          <Upload className="h-5 w-5 shrink-0" aria-hidden />
          <span className="truncate">{fileName ?? "Upload the Whish confirmation"}</span>
        </label>
        <input
          id="screenshot"
          name="screenshot"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </div>

      <SubmitButton className={`${buttonClass.primary} w-full py-4 text-lg`} pendingText="Sending…">
        I’ve paid — submit for review
      </SubmitButton>
      <p className="text-center text-xs text-ink-muted">
        We publish your task once the transfer shows up in our Whish account. A reference or screenshot alone isn’t proof of payment.
      </p>
    </ActionForm>
  );
}
