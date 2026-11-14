import "server-only";
import { z } from "zod";
import { prisma } from "./db";
import { parseAmount } from "@/lib/money";
import { applyDeals, type DealLike, type DealResult } from "@/lib/deals";

const dealSelect = { id: true, kind: true, percent: true, amountCents: true, minSubtotalCents: true, menuItemId: true, startsAt: true, endsAt: true, endedAt: true } as const;

/** Live deals per restaurant (restaurants restricted for an overdue invoice run none). */
export async function liveDeals(restaurantIds: string[]): Promise<Map<string, DealLike[]>> {
  const out = new Map<string, DealLike[]>();
  if (!restaurantIds.length) return out;
  const now = new Date();
  const rows = await prisma.deal.findMany({
    where: { restaurantId: { in: [...new Set(restaurantIds)] }, endedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], restaurant: { restrictPromotion: false } },
    select: { ...dealSelect, restaurantId: true },
    orderBy: { createdAt: "desc" },
  });
  for (const { restaurantId, ...d } of rows) {
    const list = out.get(restaurantId) ?? [];
    list.push(d);
    out.set(restaurantId, list);
  }
  return out;
}

/** The deal(s) that apply to a priced cart. */
export async function dealsForCart(restaurantId: string, lines: { menuItemId: string; lineTotalCents: number }[], subtotalCents: number, deliveryFeeCents: number): Promise<DealResult> {
  const deals = (await liveDeals([restaurantId])).get(restaurantId) ?? [];
  return applyDeals(deals, { lines, subtotalCents, deliveryFeeCents });
}

export const dealInputSchema = z
  .object({
    kind: z.enum(["PERCENT_OFF", "AMOUNT_OFF", "FREE_DELIVERY"]),
    percent: z.coerce.number().int().min(1).max(90).optional(),
    amount: z.string().optional(),
    minSubtotal: z.string().optional(),
    menuItemId: z.string().optional(),
    endsIn: z.enum(["today", "3d", "7d", "30d", "never"]).default("never"),
  })
  .refine((d) => d.kind !== "PERCENT_OFF" || d.percent != null, { path: ["percent"], message: "Enter a percentage between 1 and 90" })
  .refine((d) => d.kind !== "AMOUNT_OFF" || !!d.amount, { path: ["amount"], message: "Enter the amount off" });

export class DealError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/** End of the chosen period: "today" ends at midnight Beirut time. */
function endsAt(endsIn: z.infer<typeof dealInputSchema>["endsIn"], now = new Date()): Date | null {
  if (endsIn === "never") return null;
  if (endsIn === "today") {
    const beirut = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Beirut" }));
    const offset = now.getTime() - beirut.getTime();
    beirut.setHours(24, 0, 0, 0);
    return new Date(beirut.getTime() + offset);
  }
  const days = { "3d": 3, "7d": 7, "30d": 30 }[endsIn];
  return new Date(now.getTime() + days * 86400_000);
}

export async function createDeal(restaurantId: string, userId: string, raw: unknown) {
  const input = dealInputSchema.parse(raw);
  const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { currency: true, restrictPromotion: true } });
  if (r.restrictPromotion) throw new DealError("Deals are paused while an invoice is overdue. Settle it from Billing to run deals again.");
  const amountCents = input.kind === "AMOUNT_OFF" ? parseAmount(input.amount ?? "", r.currency) : null;
  if (input.kind === "AMOUNT_OFF" && (!amountCents || amountCents <= 0)) throw new DealError("Enter a valid amount", "amount");
  const minSubtotalCents = input.minSubtotal?.trim() ? parseAmount(input.minSubtotal, r.currency) : null;
  if (input.minSubtotal?.trim() && (!minSubtotalCents || minSubtotalCents <= 0)) throw new DealError("Enter a valid minimum order", "minSubtotal");
  let menuItemId: string | null = null;
  if (input.kind !== "FREE_DELIVERY" && input.menuItemId) {
    const item = await prisma.menuItem.findFirst({ where: { id: input.menuItemId, restaurantId, archived: false }, select: { id: true } });
    if (!item) throw new DealError("Choose a dish from your menu", "menuItemId");
    menuItemId = item.id;
  }
  return prisma.deal.create({
    data: { restaurantId, kind: input.kind, percent: input.kind === "PERCENT_OFF" ? input.percent : null, amountCents, minSubtotalCents, menuItemId, endsAt: endsAt(input.endsIn), createdById: userId },
  });
}

export async function endDeal(restaurantId: string, dealId: string) {
  const res = await prisma.deal.updateMany({ where: { id: dealId, restaurantId, endedAt: null }, data: { endedAt: new Date() } });
  return res.count > 0;
}

/** For the dashboard: running and scheduled deals first, then the 20 most recent ended ones. */
export async function dashboardDeals(restaurantId: string) {
  const now = new Date();
  const rows = await prisma.deal.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" }, take: 60, include: { menuItem: { select: { name: true } } } });
  const live = rows.filter((d) => !d.endedAt && (!d.endsAt || d.endsAt > now));
  const ended = rows.filter((d) => !live.includes(d)).slice(0, 20);
  return { live, ended };
}
