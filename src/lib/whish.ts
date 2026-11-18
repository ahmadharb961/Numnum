// How restaurants pay numnum's commission: Whish to numnum's number, with their restaurant name in
// the transfer note (so the payment can be matched to them at a glance on the Whish statement).

/** numnum's Whish number, used whenever Admin → Settings has none saved. */
export const NUMNUM_WHISH_NUMBER = "76066652";
export const NUMNUM_WHISH_NAME = "numnum";

/** What the restaurant writes in the Whish transfer note: their name, then the invoice number. */
export function transferNote(restaurantName: string, invoiceNumber?: string | null) {
  const name = restaurantName.trim();
  return invoiceNumber ? `${name} · ${invoiceNumber}` : name;
}

/** "76066652" → "76 066 652" (Lebanese mobile layout), for showing; copy the raw digits. */
export function showWhishNumber(n: string) {
  const d = n.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : n;
}
