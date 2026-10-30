// WhatsApp message a restaurant forwards to its driver for a delivery order.
import { formatMoney } from "./money";
import { formatPhone } from "./phone";

export type DriverOrder = {
  reference: string;
  customerName: string;
  customerPhone: string;
  address: string;
  notes: string | null;
  mapsUrl: string | null;
  currency: string;
  totalCents: number;
  changeForCents: number | null;
  estimatedMinutes: number | null;
  acceptedAt: string | null;
  items: { name: string; quantity: number; options: string[]; note: string | null }[];
};

export function driverMessage(o: DriverOrder, restaurantName: string): string {
  const lines = [`🛵 *Delivery ${o.reference}*`, restaurantName, "", `👤 ${o.customerName}`, `📞 ${formatPhone(o.customerPhone)}`];
  if (o.address) lines.push(`📍 ${o.address}`);
  if (o.mapsUrl) lines.push(`🗺️ ${o.mapsUrl}`);
  if (o.notes) lines.push(`📝 ${o.notes}`);
  lines.push("", "🧾 Items:");
  for (const i of o.items) lines.push(`• ${i.quantity}× ${i.name}${i.options.length ? ` (${i.options.join(", ")})` : ""}${i.note ? ` — ${i.note}` : ""}`);
  lines.push("", `💵 Collect *${formatMoney(o.totalCents, o.currency)}* cash`);
  if (o.changeForCents && o.changeForCents > o.totalCents) lines.push(`💱 Pays with ${formatMoney(o.changeForCents, o.currency)}: bring ${formatMoney(o.changeForCents - o.totalCents, o.currency)} change`);
  if (o.acceptedAt && o.estimatedMinutes) {
    const by = new Date(new Date(o.acceptedAt).getTime() + o.estimatedMinutes * 60_000);
    lines.push(`⏱️ Customer expects it by ${by.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Beirut" })}`);
  }
  return lines.join("\n");
}

/** Opens WhatsApp with the message; the restaurant picks the driver's chat. */
export const driverWhatsAppUrl = (o: DriverOrder, restaurantName: string) => `https://wa.me/?text=${encodeURIComponent(driverMessage(o, restaurantName))}`;
