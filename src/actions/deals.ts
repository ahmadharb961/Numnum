"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireRestaurant } from "@/server/auth";
import { audit } from "@/server/audit";
import { createDeal, DealError, endDeal } from "@/server/deals";
import { notifyFollowers } from "@/server/follows";
import type { ActionResult } from "./menu";

export async function createDealAction(input: unknown): Promise<ActionResult & { field?: string }> {
  const ctx = await requireRestaurant("MANAGER");
  try {
    const deal = await createDeal(ctx.restaurant.id, ctx.user.id, input);
    await audit({ actorId: ctx.user.id, action: "deal.create", entityType: "deal", entityId: deal.id, data: { kind: deal.kind, percent: deal.percent, amountCents: deal.amountCents, minSubtotalCents: deal.minSubtotalCents, menuItemId: deal.menuItemId, endsAt: deal.endsAt } });
    // Followers hear about it (at most one notification per restaurant per day, see follows.ts).
    void notifyFollowers(ctx.restaurant.id, { kind: "deal", dealId: deal.id }).catch((e) => console.error("notify followers (deal)", e));
    revalidatePath("/dashboard/deals");
    return { ok: true, message: "Deal is live" };
  } catch (e) {
    if (e instanceof DealError) return { ok: false, error: e.message, field: e.field };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the deal", field: String(e.issues[0]?.path[0] ?? "") };
    return { ok: false, error: (e as Error).message || "Something went wrong" };
  }
}

export async function endDealAction(dealId: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const ok = await endDeal(ctx.restaurant.id, dealId);
  if (ok) await audit({ actorId: ctx.user.id, action: "deal.end", entityType: "deal", entityId: dealId });
  revalidatePath("/dashboard/deals");
  return ok ? { ok: true, message: "Deal ended" } : { ok: false, error: "Deal not found" };
}
