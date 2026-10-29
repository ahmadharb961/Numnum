"use server";

import { revalidatePath } from "next/cache";
import { requireRestaurant } from "@/server/auth";
import { submitPayment, openDispute } from "@/server/billing";
import { parseAmount } from "@/lib/money";
import type { ActionResult } from "./menu";

export async function submitPaymentAction(input: { invoiceId: string; amount: string; paymentDate: string; whishReference: string; receiptIds: string[] }): Promise<ActionResult> {
  const ctx = await requireRestaurant("OWNER");
  const cents = parseAmount(input.amount, "USD");
  if (cents === null || cents <= 0) return { ok: false, error: "Enter the amount you transferred" };
  if (!input.receiptIds.length) return { ok: false, error: "Attach a screenshot or photo of the Whish receipt" };
  const date = new Date(input.paymentDate);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Enter the payment date" };
  try {
    await submitPayment({ restaurantId: ctx.restaurant.id, invoiceId: input.invoiceId, userId: ctx.user.id, amountCents: cents, paymentDate: date, whishReference: input.whishReference, evidenceAssetIds: input.receiptIds });
    revalidatePath("/dashboard/billing");
    revalidatePath(`/dashboard/billing/${input.invoiceId}`);
    return { ok: true, message: "Payment submitted — awaiting verification" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function openDisputeAction(input: { commissionEventId?: string; invoiceId?: string; reason: string; details?: string; evidenceUrls?: string[] }): Promise<ActionResult> {
  const ctx = await requireRestaurant("OWNER");
  try {
    await openDispute({ restaurantId: ctx.restaurant.id, userId: ctx.user.id, ...input });
    revalidatePath("/dashboard/billing");
    return { ok: true, message: "Dispute submitted. Our team will review it." };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
