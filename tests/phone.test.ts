import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("phone normalization", () => {
  it.each([
    ["03 123 456", "9613123456"],
    ["70123456", "96170123456"],
    ["+961 71 123 456", "96171123456"],
    ["00961 81 123456", "96181123456"],
    ["961 3 123456", "9613123456"],
    ["01 234 567", "9611234567"],
  ])("accepts %s", (input, out) => {
    const r = normalizePhone(input);
    expect(r.ok && r.e164).toBe(out);
  });
  it("accepts international numbers", () => {
    const r = normalizePhone("+44 7700 900123");
    expect(r.ok && r.e164).toBe("447700900123");
  });
  it.each(["", "12", "77 123 456", "+961 99", "abc123"])("rejects %s", (input) => {
    expect(normalizePhone(input).ok).toBe(false);
  });
});
