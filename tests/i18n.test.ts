import { describe, expect, it } from "vitest";
import { AR } from "@/i18n/ar";
import { format, localName } from "@/i18n/core";

describe("Arabic translations", () => {
  it("keep every {placeholder} of the English text", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const broken = Object.entries(AR).filter(([en, ar]) => JSON.stringify(vars(en)) !== JSON.stringify(vars(ar)) && !(vars(en).length === 1 && vars(ar).length === 0 && /^\{n\} /.test(en)));
    expect(broken).toEqual([]);
  });

  it("translate with values, and fall back to English", () => {
    expect(format(AR, "Order {ref}", { ref: "NN-1" })).toBe("الطلب NN-1");
    expect(format(AR, "Some new text")).toBe("Some new text");
    expect(format(null, "Order {ref}", { ref: "NN-1" })).toBe("Order NN-1");
    expect(localName("ar", "Pizza", "بيتزا")).toBe("بيتزا");
    expect(localName("en", "Pizza", "بيتزا")).toBe("Pizza");
  });
});
