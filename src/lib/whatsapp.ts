import { formatMoney } from "./money";

export type MessageLine = {
  name: string;
  quantity: number;
  unitBaseCents: number;
  lineTotalCents: number;
  customizations: { groupName: string; optionName: string; priceDeltaCents: number; isText?: boolean }[];
  specialInstructions?: string | null;
};

export type MessageInput = {
  platformName: string;
  reference: string;
  restaurantName: string;
  currency: string;
  customer: {
    name: string;
    phone: string;
    fulfillment: "DELIVERY" | "PICKUP";
    address?: string | null;
    building?: string | null;
    area?: string | null;
    notes?: string | null;
    mapsUrl?: string | null;
  };
  lines: MessageLine[];
  subtotalCents: number;
  deliveryFeeCents: number | null;
  orderUrl?: string;
};

export function buildOrderMessage(m: MessageInput): string {
  const fm = (c: number) => formatMoney(c, m.currency);
  const out: string[] = [];
  out.push("*NEW FOOD ORDER*");
  out.push(`Order Reference: ${m.reference}`);
  out.push("");
  out.push(`Restaurant: ${m.restaurantName}`);
  out.push("");
  out.push("*CUSTOMER*");
  out.push(`Name: ${m.customer.name}`);
  out.push(`Phone: +${m.customer.phone}`);
  out.push(`Fulfillment: ${m.customer.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}`);
  if (m.customer.fulfillment === "DELIVERY") {
    if (m.customer.area) out.push(`Area: ${m.customer.area}`);
    if (m.customer.address) out.push(`Address: ${m.customer.address}`);
    if (m.customer.building) out.push(`Building / Floor: ${m.customer.building}`);
  }
  if (m.customer.mapsUrl) out.push(`Google Maps: ${m.customer.mapsUrl}`);
  if (m.customer.notes) out.push(`${m.customer.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"} notes: ${m.customer.notes}`);
  out.push("");
  out.push("*ORDER ITEMS*");
  m.lines.forEach((l, i) => {
    out.push("");
    out.push(`${i + 1}. ${l.name}`);
    out.push(`   Quantity: ${l.quantity}`);
    out.push(`   ${l.customizations.some((c) => c.priceDeltaCents !== 0) || l.quantity > 1 ? "Base price" : "Price"}: ${fm(l.unitBaseCents)}${l.quantity > 1 ? " each" : ""}`);
    if (l.customizations.length) {
      out.push("   Customizations:");
      for (const c of l.customizations) {
        if (c.isText) {
          out.push(`   - ${c.groupName}: ${c.optionName}`);
          continue;
        }
        const price = c.priceDeltaCents === 0 ? "" : `: ${c.priceDeltaCents > 0 ? "+" : "-"}${fm(Math.abs(c.priceDeltaCents))}${l.quantity > 1 ? " each" : ""}`;
        out.push(`   - ${c.groupName}: ${c.optionName}${price}`);
      }
    }
    if (l.specialInstructions) out.push(`   Note: ${l.specialInstructions}`);
    out.push(`   Line total: ${fm(l.lineTotalCents)}`);
  });
  out.push("");
  out.push(`*ITEM SUBTOTAL: ${fm(m.subtotalCents)}*`);
  if (m.customer.fulfillment === "DELIVERY") {
    if (m.deliveryFeeCents == null) {
      out.push("Delivery fee: To be confirmed");
      out.push("Final payable total: To be confirmed");
    } else {
      out.push(`Delivery fee: ${fm(m.deliveryFeeCents)}`);
      out.push(`Final payable total: ${fm(m.subtotalCents + m.deliveryFeeCents)}`);
    }
    out.push("");
    out.push("Please confirm availability, delivery charge, final total, and estimated arrival time.");
  } else {
    out.push(`Final payable total: ${fm(m.subtotalCents)}`);
    out.push("");
    out.push("Please confirm availability, final total, and pickup time.");
  }
  out.push("");
  out.push(`Order generated through ${m.platformName}.`);
  if (m.orderUrl) out.push(m.orderUrl);
  return out.join("\n");
}

export function buildWhatsAppLink(numberE164: string, message: string): string {
  const digits = numberE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
