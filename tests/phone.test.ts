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

import { normalizeMobile } from "@/lib/phone";

describe("mobile numbers (required to order: restaurants reach customers on WhatsApp)", () => {
  it.each(["70 123 456", "03 123 456", "+961 71 234 567", "0096181123456", "+44 7700 900123"])("accepts %s", (input) => {
    expect(normalizeMobile(input).ok).toBe(true);
  });
  it.each(["01 234 567", "04 123 456", "+961 1 234 567"])("refuses the Lebanese landline %s", (input) => {
    const r = normalizeMobile(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mobile number/);
  });
  it("requires a number", () => {
    expect(normalizeMobile("")).toEqual({ ok: false, error: "Enter your mobile number" });
  });
});
