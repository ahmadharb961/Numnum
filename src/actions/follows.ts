"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { setFollow } from "@/server/follows";
import { prisma } from "@/server/db";

/**
 * Follow / unfollow a restaurant. A server action (not a plain API call) so that revalidating
 * clears the app's preloaded copies of pages: the restaurant page opened right after shows the new
 * state and follower count instead of what was preloaded before the tap.
 */
export async function followAction(restaurantId: string, follow: boolean): Promise<{ ok: true; following: boolean; followerCount: number } | { ok: false; login: boolean }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, login: true };
  try {
    const r = await setFollow(me.id, restaurantId, follow);
    const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
    if (rest) revalidatePath(`/r/${rest.slug}`);
    return { ok: true, ...r };
  } catch {
    return { ok: false, login: false };
  }
}
