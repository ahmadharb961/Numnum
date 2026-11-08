"use client";

import { CheckCheck } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { markTakenAction } from "./actions";

export function MarkTakenButton({ taskId, compact }: { taskId: string; compact?: boolean }) {
  return (
    <ActionForm action={markTakenAction} confirm="Mark this task as taken? It will leave the live feed." className="flex flex-col">
      <input type="hidden" name="task_id" value={taskId} />
      <SubmitButton className={compact ? `${buttonClass.secondary} px-4 py-2 text-sm` : buttonClass.secondary} pendingText="Saving…">
        <CheckCheck className="h-4 w-4" aria-hidden /> Mark as taken
      </SubmitButton>
    </ActionForm>
  );
}
