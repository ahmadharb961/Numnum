// Restaurant deals: the one place that decides what a deal takes off an order. Used by the
// server when quoting and placing orders (authoritative) and by the app to show badges and
// discounted prices, so what customers see is exactly what they're charged.
import { formatMoney, roundHalfUp } from "./money";
import type { T } from "@/i18n/core";

export type DealKindName = "PERCENT_OFF" | "AMOUNT_OFF" | "FREE_DELIVERY";

export type DealLike = {
  id: string;
  kind: DealKindName;
  percent: number | null;
  amountCents: number | null;
  minSubtotalCents: number | null;
  menuItemId: string | null;
  startsAt: Date | string;
  endsAt: Date | string | null;
  endedAt: Date | string | null;
};

const time = (d: Date | string | null) => (d == null ? null : new Date(d).getTime());

/** Running right now: started, not past its end date, not ended early. */
export function isLive(d: DealLike, now = Date.now()): boolean {
  const start = time(d.startsAt) ?? 0;
  const end = time(d.endsAt);
  return !d.endedAt && start <= now && (end == null || end > now);
}

export type DealResult = {
  /** Amount off the food, in the restaurant's currency (never more than the subtotal). */
  discountCents: number;
  /** Delivery fee waived by a free-delivery deal. */
  deliveryFeeWaivedCents: number;
  food: DealLike | null;
  delivery: DealLike | null;
};

/** What one food deal takes off this cart (0 if it doesn't apply). */
function foodDiscount(d: DealLike, lines: { menuItemId: string; lineTotalCents: number }[], subtotalCents: number): number {
  if (d.minSubtotalCents && subtotalCents < d.minSubtotalCents) return 0;
  const base = d.menuItemId ? lines.filter((l) => l.menuItemId === d.menuItemId).reduce((s, l) => s + l.lineTotalCents, 0) : subtotalCents;
  if (base <= 0) return 0;
  if (d.kind === "PERCENT_OFF" && d.percent) return Math.min(base, roundHalfUp((base * d.percent) / 100));
  if (d.kind === "AMOUNT_OFF" && d.amountCents) return Math.min(base, d.amountCents);
  return 0;
}

/**
 * The best food deal (largest saving) plus a free-delivery deal, if any apply. Deals don't stack
 * with each other beyond that: one food deal, one delivery deal.
 */
export function applyDeals(deals: DealLike[], cart: { lines: { menuItemId: string; lineTotalCents: number }[]; subtotalCents: number; deliveryFeeCents: number }, now = Date.now()): DealResult {
  const live = deals.filter((d) => isLive(d, now));
  let food: DealLike | null = null;
  let discountCents = 0;
  for (const d of live) {
    if (d.kind === "FREE_DELIVERY") continue;
    const off = foodDiscount(d, cart.lines, cart.subtotalCents);
    if (off > discountCents) {
      discountCents = off;
      food = d;
    }
  }
  const delivery = cart.deliveryFeeCents > 0 ? live.find((d) => d.kind === "FREE_DELIVERY" && !(d.minSubtotalCents && cart.subtotalCents < d.minSubtotalCents)) ?? null : null;
  return { discountCents: Math.min(discountCents, cart.subtotalCents), deliveryFeeWaivedCents: delivery ? cart.deliveryFeeCents : 0, food, delivery };
}

/**
 * A dish's price after a percentage deal on it or on the whole menu (no minimum order). Only %
 * deals change a shown price: they scale with quantity, while an amount off applies once per order
 * (shown as a badge, exact at checkout).
 */
export function dealPrice(deals: DealLike[], menuItemId: string, priceCents: number, now = Date.now()): number | null {
  let best = priceCents;
  for (const d of deals) {
    if (!isLive(d, now) || d.kind !== "PERCENT_OFF" || d.minSubtotalCents) continue;
    if (d.menuItemId && d.menuItemId !== menuItemId) continue;
    best = Math.min(best, priceCents - foodDiscount(d, [{ menuItemId, lineTotalCents: priceCents }], priceCents));
  }
  return best < priceCents ? best : null;
}

/** Translation key + values describing a deal ("20% off Double Smash Burger", "Free delivery over $15"). */
export function dealText(d: Pick<DealLike, "kind" | "percent" | "amountCents" | "minSubtotalCents">, currency: string, itemName?: string | null): { k: string; v: Record<string, string | number> } {
  const min = d.minSubtotalCents ? formatMoney(d.minSubtotalCents, currency) : null;
  if (d.kind === "FREE_DELIVERY") return min ? { k: "Free delivery over {min}", v: { min } } : { k: "Free delivery", v: {} };
  const off = d.kind === "PERCENT_OFF" ? `${d.percent}%` : formatMoney(d.amountCents ?? 0, currency);
  if (itemName) return min ? { k: "{off} off {dish} on orders over {min}", v: { off, dish: itemName, min } } : { k: "{off} off {dish}", v: { off, dish: itemName } };
  return min ? { k: "{off} off orders over {min}", v: { off, min } } : { k: "{off} off the menu", v: { off } };
}

/** Short badge for a reel or dish: "20% off", "$3 off", "Free delivery". */
export function dealBadge(d: Pick<DealLike, "kind" | "percent" | "amountCents">, currency: string, t: T): string {
  if (d.kind === "FREE_DELIVERY") return t("Free delivery");
  return t("{off} off", { off: d.kind === "PERCENT_OFF" ? `${d.percent}%` : formatMoney(d.amountCents ?? 0, currency) });
}

/** The order's deal, stored with it so the customer and restaurant see what applied at order time. */
export function dealSummaryOf(r: DealResult, currency: string, itemName: (id: string) => string | null): string | null {
  const parts = [r.food && dealText(r.food, currency, r.food.menuItemId ? itemName(r.food.menuItemId) : null), r.delivery && dealText(r.delivery, currency)].filter(Boolean);
  return parts.length ? JSON.stringify(parts) : null;
}

/** Shows a stored deal summary in the reader's language. */
export function showDealSummary(t: T, stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const parts = JSON.parse(stored) as { k: string; v: Record<string, string | number> }[];
    return parts.map((p) => t(p.k, p.v)).join(" · ");
  } catch {
    return stored;
  }
}

export type ShownDeal = Pick<DealLike, "kind" | "percent" | "amountCents" | "minSubtotalCents"> & { onDish: boolean };

/** The deal to show on a dish (its own deal first, then a whole-menu one, then free delivery). */
export function dealForDish(deals: DealLike[], menuItemId: string, now = Date.now()): ShownDeal | null {
  const live = deals.filter((d) => isLive(d, now));
  const pick = live.find((d) => d.kind !== "FREE_DELIVERY" && d.menuItemId === menuItemId) ?? live.find((d) => d.kind !== "FREE_DELIVERY" && !d.menuItemId) ?? live.find((d) => d.kind === "FREE_DELIVERY");
  return pick ? { kind: pick.kind, percent: pick.percent, amountCents: pick.amountCents, minSubtotalCents: pick.minSubtotalCents, onDish: !!pick.menuItemId } : null;
}

/** The best % deal that changes this dish's shown price (on the dish or the whole menu, no minimum). */
export function percentForDish(deals: DealLike[], menuItemId: string, now = Date.now()): number | null {
  let best = 0;
  for (const d of deals) if (isLive(d, now) && d.kind === "PERCENT_OFF" && !d.minSubtotalCents && (!d.menuItemId || d.menuItemId === menuItemId)) best = Math.max(best, d.percent ?? 0);
  return best || null;
}

/** A price after a % deal (same rounding as checkout). */
export const afterPercent = (cents: number, percent: number | null | undefined) => (percent ? cents - roundHalfUp((cents * percent) / 100) : cents);
