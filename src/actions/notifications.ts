"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { markUserNotificationsRead } from "@/server/user-notifications";

/** The person opened their notifications: all read (the bell's count clears everywhere). */
export async function markMyNotificationsReadAction() {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const };
  const { count } = await markUserNotificationsRead(me.id);
  if (count) {
    revalidatePath("/account");
    revalidatePath("/creator");
  }
  return { ok: true as const, count };
}
