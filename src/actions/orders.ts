"use server";

import { revalidatePath } from "next/cache";
import { requireRestaurant } from "@/server/auth";
import { restaurantOrderAction, type RestaurantOrderAction } from "@/server/orders";
import type { ActionResult } from "./menu";

const MESSAGES: Record<RestaurantOrderAction, string> = {
  ACCEPT: "Order accepted — the customer has been notified",
  REJECT: "Order rejected",
  PREPARING: "Marked as preparing",
  DISPATCH: "Customer notified",
  COMPLETE: "Order completed",
  FAIL: "Marked as not delivered",
};

export async function orderAction(orderId: string, action: RestaurantOrderAction, opts: { reason?: string; etaMinutes?: number } = {}): Promise<ActionResult> {
  const ctx = await requireRestaurant("STAFF");
  try {
    await restaurantOrderAction(ctx.restaurant.id, ctx.user.id, orderId, action, opts);
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard");
    return { ok: true, message: MESSAGES[action] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
