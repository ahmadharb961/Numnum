"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { removeTaskImage } from "@/lib/images";
import type { ActionState } from "@/lib/types";

const id = z.uuid();

export async function markTakenAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const taskId = id.safeParse(formData.get("task_id"));
  if (!taskId.success) return { error: "Task not found." };
  const { supabase } = await getSession();
  if (!supabase) return { error: "Please sign in." };
  const { error } = await supabase.rpc("mark_task_taken", { p_task_id: taskId.data });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/");
  revalidatePath("/my");
  revalidatePath(`/t/${taskId.data}`);
  return { ok: "Marked as taken — it’s off the live feed." };
}

export async function discardDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const taskId = id.safeParse(formData.get("task_id"));
  if (!taskId.success) return { error: "Task not found." };
  const { supabase, user } = await getSession();
  if (!supabase || !user) return { error: "Please sign in." };
  const { data: task } = await supabase.from("tasks").select("image_path").eq("id", taskId.data).maybeSingle();
  const { error } = await supabase.rpc("discard_draft", { p_task_id: taskId.data });
  if (error) return { error: friendlyError(error) };
  if (task?.image_path) await removeTaskImage(task.image_path).catch(() => {});
  revalidatePath("/my");
  redirect("/my");
}
