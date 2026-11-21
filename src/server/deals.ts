import "server-only";
import { z } from "zod";
import { prisma } from "./db";
import { parseAmount } from "@/lib/money";
import { applyDeals, type DealLike, type DealResult } from "@/lib/deals";

const dealSelect = { id: true, kind: true, percent: true, amountCents: true, minSubtotalCents: true, menuItemId: true, startsAt: true, endsAt: true, endedAt: true } as const;

// Badges on reels read deals often (every feed page): a short shared cache, cleared at once when a
// deal is created or ended here. Pricing (quote and order) always reads fresh: { cached: false }.
const CACHE_MS = 15_000;
// Kept on globalThis: Next bundles server actions (the dashboard's "Start deal") and pages
// separately, each with its own copy of module variables, so a module-level cache cleared by the
// action would stay stale for the pages.
type DealCache = { at: number; byRestaurant: Promise<Map<string, DealLike[]>> } | null;
const store = globalThis as typeof globalThis & { __nnDealCache?: DealCache };
export function clearDealCache() {
  store.__nnDealCache = null;
}

/** Live deals per restaurant (restaurants restricted for an overdue invoice run none). */
export async function liveDeals(restaurantIds: string[], opts: { cached?: boolean } = {}): Promise<Map<string, DealLike[]>> {
  const out = new Map<string, DealLike[]>();
  if (!restaurantIds.length) return out;
  if (opts.cached) {
    let cache = store.__nnDealCache;
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      const byRestaurant = loadLive();
      cache = store.__nnDealCache = { at: Date.now(), byRestaurant };
      byRestaurant.catch(() => {
        if (store.__nnDealCache?.byRestaurant === byRestaurant) store.__nnDealCache = null;
      });
    }
    const all = await cache.byRestaurant;
    for (const id of new Set(restaurantIds)) if (all.has(id)) out.set(id, all.get(id)!);
    return out;
  }
  return loadLive(restaurantIds);
}

/** Every restaurant running a deal right now, with its deals (NumOffers). Shares the short cache. */
export async function allLiveDeals(): Promise<Map<string, DealLike[]>> {
  let cache = store.__nnDealCache;
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const byRestaurant = loadLive();
    cache = store.__nnDealCache = { at: Date.now(), byRestaurant };
    byRestaurant.catch(() => {
      if (store.__nnDealCache?.byRestaurant === byRestaurant) store.__nnDealCache = null;
    });
  }
  return cache.byRestaurant;
}

/** All live deals (or those of the given restaurants), grouped by restaurant. */
async function loadLive(restaurantIds?: string[]): Promise<Map<string, DealLike[]>> {
  const out = new Map<string, DealLike[]>();
  const now = new Date();
  const rows = await prisma.deal.findMany({
    where: { ...(restaurantIds ? { restaurantId: { in: [...new Set(restaurantIds)] } } : {}), endedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], restaurant: { restrictPromotion: false } },
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
  const deal = await prisma.deal.create({
    data: { restaurantId, kind: input.kind, percent: input.kind === "PERCENT_OFF" ? input.percent : null, amountCents, minSubtotalCents, menuItemId, endsAt: endsAt(input.endsIn), createdById: userId },
  });
  clearDealCache(); // after saving, so no request can cache the old state in between
  return deal;
}

export async function endDeal(restaurantId: string, dealId: string) {
  const res = await prisma.deal.updateMany({ where: { id: dealId, restaurantId, endedAt: null }, data: { endedAt: new Date() } });
  clearDealCache();
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
