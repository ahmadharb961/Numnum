"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { fileFromForm, ImageError, uploadAvatar } from "@/lib/images";
import type { ActionState } from "@/lib/types";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!supabase || !user) return { error: "Please sign in." };
  const name = z.string().trim().min(1, "Enter your name.").max(40, "Name must be 40 characters or less.").safeParse(formData.get("display_name") ?? "");
  if (!name.success) return { error: name.error.issues[0]!.message };

  const update: { display_name: string; avatar_url?: string | null } = { display_name: name.data };
  const file = fileFromForm(formData, "avatar");
  if (file) {
    try {
      update.avatar_url = await uploadAvatar(user.id, file);
    } catch (e) {
      return { error: e instanceof ImageError ? e.message : "The photo couldn’t be uploaded." };
    }
  } else if (formData.get("remove_avatar") === "1") {
    update.avatar_url = null;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { error: "Couldn’t save your profile. Please try again." };
  revalidatePath("/", "layout");
  return { ok: "Profile saved." };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!supabase || !user) return { error: "Please sign in." };
  const pw = z.string().min(8, "Password must be at least 8 characters.").max(72).safeParse(formData.get("password") ?? "");
  if (!pw.success) return { error: pw.error.issues[0]!.message };
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { error: error.message };
  return { ok: "Password updated." };
}
