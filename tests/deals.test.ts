import { describe, expect, it } from "vitest";
import { afterPercent, applyDeals, dealForDish, dealPrice, dealSummaryOf, dealText, isLive, percentForDish, showDealSummary, type DealLike } from "@/lib/deals";

const NOW = new Date("2026-11-15T12:00:00Z").getTime();
const base = { percent: null, amountCents: null, minSubtotalCents: null, menuItemId: null, startsAt: "2026-11-01T00:00:00Z", endsAt: null, endedAt: null };
const pct = (p: number, extra: Partial<DealLike> = {}): DealLike => ({ ...base, id: `p${p}`, kind: "PERCENT_OFF", percent: p, ...extra });
const amt = (c: number, extra: Partial<DealLike> = {}): DealLike => ({ ...base, id: `a${c}`, kind: "AMOUNT_OFF", amountCents: c, ...extra });
const free = (extra: Partial<DealLike> = {}): DealLike => ({ ...base, id: "free", kind: "FREE_DELIVERY", ...extra });
const cart = (lines: [string, number][], fee = 200) => ({ lines: lines.map(([menuItemId, lineTotalCents]) => ({ menuItemId, lineTotalCents })), subtotalCents: lines.reduce((s, [, c]) => s + c, 0), deliveryFeeCents: fee });

describe("deals", () => {
  it("only live deals count (started, not past their end, not ended early)", () => {
    expect(isLive(pct(10), NOW)).toBe(true);
    expect(isLive(pct(10, { startsAt: "2026-12-01T00:00:00Z" }), NOW)).toBe(false);
    expect(isLive(pct(10, { endsAt: "2026-11-15T11:59:00Z" }), NOW)).toBe(false);
    expect(isLive(pct(10, { endedAt: "2026-11-10T00:00:00Z" }), NOW)).toBe(false);
  });

  it("20% off the whole menu", () => {
    const r = applyDeals([pct(20)], cart([["a", 1000], ["b", 600]]), NOW);
    expect(r.discountCents).toBe(320);
    expect(r.food?.id).toBe("p20");
  });

  it("a dish deal only discounts that dish", () => {
    const r = applyDeals([pct(50, { menuItemId: "b" })], cart([["a", 1000], ["b", 600]]), NOW);
    expect(r.discountCents).toBe(300);
  });

  it("the best food deal wins; deals don't stack", () => {
    const r = applyDeals([pct(10), amt(500)], cart([["a", 2000]]), NOW);
    expect(r.discountCents).toBe(500);
    expect(r.food?.id).toBe("a500");
  });

  it("a minimum order is respected", () => {
    expect(applyDeals([amt(500, { minSubtotalCents: 2500 })], cart([["a", 2000]]), NOW).discountCents).toBe(0);
    expect(applyDeals([amt(500, { minSubtotalCents: 2500 })], cart([["a", 2500]]), NOW).discountCents).toBe(500);
  });

  it("never takes off more than the food costs", () => {
    expect(applyDeals([amt(5000)], cart([["a", 1200]]), NOW).discountCents).toBe(1200);
  });

  it("free delivery waives the fee, alongside a food deal", () => {
    const r = applyDeals([pct(10), free({ minSubtotalCents: 1500 })], cart([["a", 2000]], 350), NOW);
    expect(r.discountCents).toBe(200);
    expect(r.deliveryFeeWaivedCents).toBe(350);
    expect(applyDeals([free({ minSubtotalCents: 1500 })], cart([["a", 1000]], 350), NOW).deliveryFeeWaivedCents).toBe(0);
    expect(applyDeals([free()], cart([["a", 1000]], 0), NOW).deliveryFeeWaivedCents).toBe(0);
  });

  it("LBP amounts stay whole pounds", () => {
    const r = applyDeals([pct(15)], cart([["a", 450000]]), NOW);
    expect(r.discountCents).toBe(67500);
  });

  it("the price shown on a dish matches what checkout takes off for that dish", () => {
    const deals = [pct(20)];
    for (const price of [750, 999, 1234, 450000]) {
      const shown = afterPercent(price, percentForDish(deals, "a", NOW));
      expect(shown).toBe(price - applyDeals(deals, cart([["a", price]]), NOW).discountCents);
      expect(dealPrice(deals, "a", price, NOW)).toBe(shown);
    }
  });

  it("an amount off or a minimum order never changes a dish's shown price (exact only at checkout)", () => {
    expect(dealPrice([amt(300)], "a", 1000, NOW)).toBeNull();
    expect(dealPrice([pct(20, { minSubtotalCents: 2000 })], "a", 1000, NOW)).toBeNull();
    expect(percentForDish([pct(20, { menuItemId: "b" })], "a", NOW)).toBeNull();
  });

  it("a dish shows its own deal first, then a menu deal, then free delivery", () => {
    expect(dealForDish([free(), pct(10), pct(30, { menuItemId: "a" })], "a", NOW)).toMatchObject({ percent: 30, onDish: true });
    expect(dealForDish([free(), pct(10)], "a", NOW)).toMatchObject({ percent: 10, onDish: false });
    expect(dealForDish([free()], "a", NOW)).toMatchObject({ kind: "FREE_DELIVERY" });
  });

  it("describes deals for customers, and the order keeps what applied", () => {
    expect(dealText(pct(20), "USD")).toEqual({ k: "{off} off the menu", v: { off: "20%" } });
    expect(dealText(amt(500, { minSubtotalCents: 2500 }), "USD", null)).toEqual({ k: "{off} off orders over {min}", v: { off: "$5.00", min: "$25.00" } });
    expect(dealText(free(), "USD")).toEqual({ k: "Free delivery", v: {} });
    const r = applyDeals([pct(20, { menuItemId: "a" }), free()], cart([["a", 1000]], 300), NOW);
    const stored = dealSummaryOf(r, "USD", () => "Burger");
    const t = (k: string, v?: Record<string, string | number | null | undefined>) => k.replace(/\{(\w+)\}/g, (_, x) => String(v?.[x] ?? ""));
    expect(showDealSummary(t, stored)).toBe("20% off Burger · Free delivery");
    expect(dealSummaryOf(applyDeals([], cart([["a", 1000]]), NOW), "USD", () => null)).toBeNull();
  });
});
