"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { fileFromForm, ImageError, uploadPaymentProof } from "@/lib/images";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

const schema = z.object({
  task_id: z.uuid(),
  reference: z
    .string()
    .trim()
    .min(3, "Enter the Whish transaction reference.")
    .max(80, "That reference is too long."),
});

export async function submitPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ task_id: formData.get("task_id"), reference: formData.get("reference") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { supabase, user } = await getSession();
  if (!supabase || !user) return { error: "Please sign in." };

  let screenshot: string | null = null;
  const file = fileFromForm(formData, "screenshot");
  if (file) {
    try {
      screenshot = await uploadPaymentProof(user.id, file);
    } catch (e) {
      return { error: e instanceof ImageError ? e.message : "The screenshot couldn’t be uploaded." };
    }
  }

  const { error } = await supabase.rpc("submit_payment", {
    p_task_id: parsed.data.task_id,
    p_reference: parsed.data.reference,
    p_screenshot_path: screenshot,
  });
  if (error) {
    if (screenshot) await createAdminClient().storage.from("payment-proofs").remove([screenshot]).catch(() => {});
    return { error: friendlyError(error) };
  }
  revalidatePath(`/pay/${parsed.data.task_id}`);
  revalidatePath("/my");
  return { ok: "submitted" };
}
