import { describe, expect, it } from "vitest";
import { buildOrderMessage, buildWhatsAppLink } from "@/lib/whatsapp";

const input = {
  platformName: "numnum",
  reference: "NN-2026-000125",
  restaurantName: "Burger House",
  currency: "USD",
  customer: { name: "John Smith", phone: "96170123456", fulfillment: "DELIVERY" as const, address: "Beirut, Hamra", mapsUrl: "https://maps.google.com/?q=33.89,35.48" },
  lines: [
    { name: "Double Smash Burger", quantity: 2, unitBaseCents: 750, lineTotalCents: 1700, customizations: [
      { groupName: "Extras", optionName: "Extra cheese", priceDeltaCents: 100 },
      { groupName: "Remove", optionName: "No pickles", priceDeltaCents: 0 },
      { groupName: "Sauce", optionName: "BBQ sauce", priceDeltaCents: 0 },
    ] },
    { name: "French Fries", quantity: 1, unitBaseCents: 300, lineTotalCents: 300, customizations: [] },
  ],
  subtotalCents: 2000,
  deliveryFeeCents: null,
};

describe("WhatsApp message", () => {
  it("contains the complete itemized order", () => {
    const m = buildOrderMessage(input);
    expect(m).toContain("Order Reference: NN-2026-000125");
    expect(m).toContain("Restaurant: Burger House");
    expect(m).toContain("Name: John Smith");
    expect(m).toContain("Phone: +96170123456");
    expect(m).toContain("Google Maps: https://maps.google.com/?q=33.89,35.48");
    expect(m).toContain("1. Double Smash Burger");
    expect(m).toContain("Base price: $7.50 each");
    expect(m).toContain("Extra cheese: +$1.00 each");
    expect(m).toContain("Line total: $17.00");
    expect(m).toContain("ITEM SUBTOTAL: $20.00");
    expect(m).toContain("Delivery fee: To be confirmed");
    expect(m).toContain("Final payable total: To be confirmed");
    expect(m).toContain("Order generated through numnum.");
  });
  it("shows known delivery fee", () => {
    const m = buildOrderMessage({ ...input, deliveryFeeCents: 200 });
    expect(m).toContain("Delivery fee: $2.00");
    expect(m).toContain("Final payable total: $22.00");
  });
  it("encodes the deep link", () => {
    const link = buildWhatsAppLink("+961 70 123 456", "Hi & bye\nline");
    expect(link).toBe("https://wa.me/96170123456?text=Hi%20%26%20bye%0Aline");
  });
});
