import { describe, expect, it } from "vitest";
import { calcCommission, formatMoney, parseAmount, toUsdCents, formatRate } from "@/lib/money";

describe("commission math", () => {
  it("computes 14% of $20.00 as $2.80", () => {
    expect(calcCommission(2000, 1400)).toBe(280);
  });
  it("computes 14% of $75.00 as $10.50", () => {
    expect(calcCommission(7500, 1400)).toBe(1050);
  });
  it("computes 14% of $3,500 as $490", () => {
    expect(calcCommission(350000, 1400)).toBe(49000);
  });
  it("rounds half up to the cent", () => {
    expect(calcCommission(1075, 1400)).toBe(151); // 150.5 → 151
    expect(calcCommission(1, 1400)).toBe(0); // 0.14 → 0
    expect(calcCommission(4, 1400)).toBe(1); // 0.56 → 1
  });
  it("rejects non-integers", () => {
    expect(() => calcCommission(20.5, 1400)).toThrow();
  });
});

describe("amount parsing", () => {
  it("parses common USD formats", () => {
    expect(parseAmount("7.5")).toBe(750);
    expect(parseAmount("$7.50")).toBe(750);
    expect(parseAmount("7,50")).toBe(750);
    expect(parseAmount("1,250.00")).toBe(125000);
    expect(parseAmount("12")).toBe(1200);
  });
  it("rejects garbage and excess precision", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("7.555")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
  it("parses LBP whole amounts", () => {
    expect(parseAmount("450,000", "LBP")).toBe(450000);
    expect(parseAmount("450000", "LBP")).toBe(450000);
  });
});

describe("formatting & conversion", () => {
  it("formats", () => {
    expect(formatMoney(1700)).toBe("$17.00");
    expect(formatMoney(450000, "LBP")).toBe("450,000 LBP");
    expect(formatRate(1400)).toBe("14%");
  });
  it("converts LBP with explicit rate only", () => {
    expect(toUsdCents(895000, "LBP", 89500)).toBe(1000);
    expect(() => toUsdCents(895000, "LBP", null)).toThrow();
    expect(toUsdCents(1234, "USD", null)).toBe(1234);
  });
});
