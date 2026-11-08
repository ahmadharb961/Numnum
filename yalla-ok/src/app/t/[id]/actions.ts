"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { visitorKey } from "@/lib/request";
import { friendlyError } from "@/lib/errors";
import type { ActionState } from "@/lib/types";

const schema = z.object({
  task_id: z.uuid(),
  reason: z.enum(["spam", "scam", "inappropriate", "illegal", "duplicate", "other"]),
  details: z.string().max(300).optional(),
});

export async function reportTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    task_id: formData.get("task_id"),
    reason: formData.get("reason"),
    details: formData.get("details") || undefined,
  });
  if (!parsed.success) return { error: "Please choose a reason." };

  const { user } = await getSession();
  const key = user ? user.id : await visitorKey();

  const { error } = await createAdminClient().rpc("report_task", {
    p_task_id: parsed.data.task_id,
    p_reporter_id: user?.id ?? null,
    p_reporter_key: key,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details ?? null,
  });
  if (error) return { error: friendlyError(error) };
  return { ok: "Thanks — our team will take a look. Reported tasks are reviewed quickly." };
}
