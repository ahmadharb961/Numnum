"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { removeTaskImage } from "@/lib/images";
import type { ActionState } from "@/lib/types";

const uuid = z.uuid();
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

async function run(fn: string, args: Record<string, unknown>, ok: string): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  return { ok };
}

// ----------------------------------------------------------------- payments
export async function reviewPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("submission_id"));
  if (!id.success) return { error: "Unknown submission." };
  const note = str(formData.get("note"));
  if (formData.get("decision") === "approve") {
    return run("admin_approve_payment", { p_submission_id: id.data, p_note: note || null }, "Payment verified — task is live.");
  }
  if (!note) return { error: "Add a short reason so the poster knows what to fix." };
  return run("admin_reject_payment", { p_submission_id: id.data, p_note: note }, "Payment rejected. The poster can pay again.");
}

// -------------------------------------------------------------------- tasks
export async function approveTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("task_id"));
  if (!id.success) return { error: "Unknown task." };
  return run("admin_approve_task", { p_task_id: id.data }, "Approved — the countdown has started.");
}

export async function rejectTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("task_id"));
  if (!id.success) return { error: "Unknown task." };
  const reason = str(formData.get("reason"));
  if (!reason) return { error: "Add a reason." };
  return run("admin_reject_task", { p_task_id: id.data, p_reason: reason }, "Task rejected.");
}

const editSchema = z.object({
  task_id: z.uuid(),
  headline: z.string().trim().min(3).max(50),
  description: z.string().trim().min(1).max(120),
  reward: z.coerce.number().positive().max(100000),
  location: z.string().trim().min(2).max(60),
});

export async function editTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the fields: headline 3–50, description 1–120, reward above 0, location 2–60." };
  const d = parsed.data;
  return run(
    "admin_update_task",
    {
      p_task_id: d.task_id,
      p_headline: d.headline,
      p_description: d.description,
      p_reward_cents: Math.round(d.reward * 100),
      p_location: d.location,
    },
    "Task updated.",
  );
}

export async function deleteTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("task_id"));
  if (!id.success) return { error: "Unknown task." };
  const { supabase } = await requireAdmin();
  const { data: task } = await supabase.from("tasks").select("image_path").eq("id", id.data).maybeSingle();
  const result = await run("admin_delete_task", { p_task_id: id.data }, "Task removed.");
  if (!result?.error && task?.image_path) await removeTaskImage(task.image_path).catch(() => {});
  return result;
}

// -------------------------------------------------------------------- users
export async function setUserStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("user_id"));
  const status = z.enum(["active", "suspended", "banned"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return { error: "Invalid request." };
  return run("admin_set_user_status", { p_user_id: id.data, p_status: status.data }, `Account set to ${status.data}.`);
}

export async function setFreeBonusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("user_id"));
  const bonus = z.coerce.number().int().min(-1000).max(1000).safeParse(formData.get("bonus"));
  if (!id.success || !bonus.success) return { error: "Enter a whole number." };
  return run("admin_set_free_bonus", { p_user_id: id.data, p_bonus: bonus.data }, "Free-post allowance updated.");
}

// ------------------------------------------------------------------ reports
export async function resolveReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("report_id"));
  const status = z.enum(["resolved", "dismissed"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return { error: "Invalid request." };
  return run("admin_resolve_report", { p_report_id: id.data, p_status: status.data }, `Report ${status.data}.`);
}

// ----------------------------------------------------------------- settings
const settingsSchema = z.object({
  brand_name: z.string().trim().min(1).max(40),
  hero_title: z.string().trim().min(1).max(80),
  hero_subtitle: z.string().trim().max(200),
  posting_fee: z.coerce.number().min(0).max(1000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  free_posts: z.coerce.number().int().min(0).max(1000),
  whish_account_name: z.string().trim().max(80),
  whish_number: z.string().trim().max(40),
  payment_instructions: z.string().trim().max(1000),
  allowed_durations: z
    .string()
    .transform((s) => s.split(/[\s,]+/).filter(Boolean).map(Number))
    .pipe(z.array(z.number().int().min(5).max(10080)).min(1).max(12)),
  max_tasks_per_hour: z.coerce.number().int().min(1).max(1000),
  max_tasks_per_day: z.coerce.number().int().min(1).max(10000),
  blocked_words: z.string().transform((s) => s.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean)),
});

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `Check “${String(issue?.path[0] ?? "the form").replace(/_/g, " ")}”: ${issue?.message ?? "invalid value"}.` };
  }
  const { posting_fee, ...rest } = parsed.data;
  return run(
    "admin_update_settings",
    {
      p: {
        ...rest,
        posting_fee_cents: Math.round(posting_fee * 100),
        auto_publish: formData.get("auto_publish") === "on",
      },
    },
    "Settings saved.",
  );
}
