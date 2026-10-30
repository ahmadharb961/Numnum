import { describe, expect, it } from "vitest";
import { driverMessage, driverWhatsAppUrl } from "@/lib/driver-message";

const order = {
  reference: "NN-2026-000009",
  customerName: "Rana Haddad",
  customerPhone: "96170208345",
  address: "Hamra, Bliss street, near AUB gate, Azar bldg, 3rd floor",
  notes: "Ring twice",
  mapsUrl: "https://maps.google.com/?q=33.899500,35.480700",
  currency: "USD",
  totalCents: 2150,
  changeForCents: 5000,
  estimatedMinutes: 25,
  acceptedAt: "2026-10-30T08:20:00.000Z",
  items: [
    { name: "Double Smash Burger", quantity: 2, options: ["Cheddar", "BBQ sauce"], note: null },
    { name: "French Fries", quantity: 1, options: [], note: "extra salt" },
  ],
};

describe("driver WhatsApp message", () => {
  it("has everything the driver needs", () => {
    const m = driverMessage(order, "Burger House");
    expect(m).toContain("NN-2026-000009");
    expect(m).toContain("Burger House");
    expect(m).toContain("Rana Haddad");
    expect(m).toContain("+961 70 208 345");
    expect(m).toContain("Hamra, Bliss street");
    expect(m).toContain("https://maps.google.com/?q=33.899500,35.480700");
    expect(m).toContain("Ring twice");
    expect(m).toContain("2× Double Smash Burger (Cheddar, BBQ sauce)");
    expect(m).toContain("1× French Fries — extra salt");
    expect(m).toContain("Collect *$21.50* cash");
    expect(m).toContain("bring $28.50 change");
    expect(m).toContain("by 10:45"); // 08:20 UTC + 25 min, Beirut time (UTC+2 on 30 Oct 2026)
  });
  it("skips change and ETA lines when not given", () => {
    const m = driverMessage({ ...order, changeForCents: null, acceptedAt: null, notes: null }, "Burger House");
    expect(m).not.toContain("change");
    expect(m).not.toContain("expects");
    expect(m).not.toContain("📝");
  });
  it("builds a wa.me share link with the text encoded", () => {
    const url = driverWhatsAppUrl(order, "Burger House");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe(driverMessage(order, "Burger House"));
  });
});
