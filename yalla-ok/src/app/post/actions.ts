"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { taskSchema, firstIssue } from "@/lib/validation";
import { fileFromForm, ImageError, removeTaskImage, uploadTaskImage } from "@/lib/images";
import { friendlyError } from "@/lib/errors";
import type { ActionState } from "@/lib/types";

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, profile } = await getSession();
  if (!supabase || !user || !profile) return { error: "Please sign in to post a task." };
  if (profile.status !== "active") return { error: friendlyError("account_suspended") };

  const parsed = taskSchema.safeParse({
    headline: formData.get("headline") ?? "",
    description: formData.get("description") ?? "",
    reward: formData.get("reward") ?? "",
    location: formData.get("location") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
    duration: formData.get("duration") ?? "",
    client_token: formData.get("client_token") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  let imagePath: string | null = null;
  const file = fileFromForm(formData, "image");
  if (file) {
    try {
      imagePath = await uploadTaskImage(user.id, file);
    } catch (e) {
      return { error: e instanceof ImageError ? e.message : "The photo couldn’t be uploaded. Try again or post without it." };
    }
  }

  const { data, error } = await supabase
    .rpc("create_task", {
      p_headline: input.headline,
      p_description: input.description,
      p_reward_cents: input.reward,
      p_location: input.location,
      p_whatsapp: input.whatsapp,
      p_duration_minutes: input.duration,
      p_image_path: imagePath,
      p_client_token: input.client_token,
    })
    .single<{ task_id: string; task_status: string; needs_payment: boolean }>();

  if (error || !data) {
    if (imagePath) await removeTaskImage(imagePath).catch(() => {});
    return { error: friendlyError(error) };
  }

  revalidatePath("/");
  revalidatePath("/my");
  if (data.needs_payment) redirect(`/pay/${data.task_id}`);
  if (data.task_status === "active") redirect(`/t/${data.task_id}?posted=1`);
  redirect(`/my?posted=${data.task_status}`);
}
