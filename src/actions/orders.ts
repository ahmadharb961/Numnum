"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireRestaurant } from "@/server/auth";
import { restaurantOrderAction, type RestaurantOrderAction } from "@/server/orders";
import type { ActionResult } from "./menu";

export async function orderAction(orderId: string, action: RestaurantOrderAction, reason?: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("STAFF");
  try {
    await restaurantOrderAction(ctx.restaurant.id, ctx.user.id, orderId, action, { reason, method: "LIST" });
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard");
    const msg = { ACKNOWLEDGE: "Order acknowledged", ACCEPT: "Order accepted", REJECT: "Order rejected", FULFILL: "Marked as fulfilled" }[action];
    return { ok: true, message: msg };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Acknowledge using the reference printed in the customer's WhatsApp message. */
export async function acknowledgeByReferenceAction(reference: string): Promise<ActionResult<string>> {
  const ctx = await requireRestaurant("STAFF");
  const ref = reference.trim().toUpperCase().replace(/\s+/g, "");
  const order = await prisma.order.findFirst({ where: { reference: ref, restaurantId: ctx.restaurant.id } });
  if (!order) return { ok: false, error: `No order ${ref} found for your restaurant` };
  try {
    await restaurantOrderAction(ctx.restaurant.id, ctx.user.id, order.id, "ACKNOWLEDGE", { method: "REFERENCE_LOOKUP" });
    revalidatePath("/dashboard/orders");
    return { ok: true, data: order.id, message: `Order ${ref} acknowledged` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
