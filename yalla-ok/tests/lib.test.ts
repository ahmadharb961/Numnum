import { describe, expect, it } from "vitest";
import { normalizeWhatsapp, whatsappMessage, whatsappUrl, isMobileUserAgent } from "@/lib/whatsapp";
import { formatCountdown, formatMoney, durationLabel } from "@/lib/format";
import { taskSchema } from "@/lib/validation";
import { friendlyError } from "@/lib/errors";

describe("whatsapp", () => {
  it("normalises numbers with a country code", () => {
    expect(normalizeWhatsapp("+961 70 123 456")).toBe("+96170123456");
    expect(normalizeWhatsapp("00961-70-123456")).toBe("+96170123456");
    expect(normalizeWhatsapp("(+961) 70.123.456")).toBe("+96170123456");
  });
  it("rejects numbers without a country code", () => {
    expect(normalizeWhatsapp("70 123 456")).toBeNull();
    expect(normalizeWhatsapp("+0123456789")).toBeNull();
    expect(normalizeWhatsapp("")).toBeNull();
  });
  it("builds the prefilled message and the right link per device", () => {
    const text = whatsappMessage("Assemble IKEA desk");
    expect(text).toBe("Hi, I saw your task on Yalla Ok: Assemble IKEA desk. I’m interested in doing it.");
    expect(whatsappUrl("+96170123456", text, true)).toMatch(/^https:\/\/wa\.me\/96170123456\?text=Hi%2C/);
    expect(whatsappUrl("+96170123456", text, false)).toMatch(/^https:\/\/web\.whatsapp\.com\/send\?phone=96170123456&text=/);
    expect(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});

describe("format", () => {
  it("formats money without needless decimals", () => {
    expect(formatMoney(5000)).toBe("$50");
    expect(formatMoney(750)).toBe("$7.50");
    expect(formatMoney(100)).toBe("$1");
  });
  it("formats countdowns", () => {
    expect(formatCountdown(((1 * 60 + 42) * 60 + 10) * 1000)).toBe("1:42:10");
    expect(formatCountdown((58 * 60 + 24) * 1000)).toBe("58:24");
    expect(formatCountdown(-5)).toBe("0:00");
  });
  it("labels durations", () => {
    expect([30, 60, 180, 360, 720, 1440].map(durationLabel)).toEqual(["30 min", "1 hour", "3 hours", "6 hours", "12 hours", "24 hours"]);
  });
});

describe("task form validation", () => {
  const base = {
    headline: "  Assemble   IKEA desk ",
    description: "One desk, all parts ready.",
    reward: "$50",
    location: "Achrafieh",
    whatsapp: "+961 70 123 456",
    duration: "180",
    client_token: "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  };
  it("accepts a valid task and cleans it", () => {
    const r = taskSchema.parse(base);
    expect(r).toMatchObject({ headline: "Assemble IKEA desk", reward: 5000, whatsapp: "+96170123456", duration: 180 });
  });
  it("enforces limits", () => {
    expect(taskSchema.safeParse({ ...base, headline: "x".repeat(51) }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, description: "x".repeat(121) }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, reward: "0" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, reward: "-5" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, whatsapp: "70123456" }).success).toBe(false);
    expect(taskSchema.parse({ ...base, reward: "7.5" }).reward).toBe(750);
  });
});

describe("errors", () => {
  it("maps database error codes to friendly text", () => {
    expect(friendlyError({ message: "duplicate_task" })).toMatch(/already have this task/);
    expect(friendlyError({ message: "weird" })).toMatch(/Something went wrong/);
  });
});
