import { z } from "zod";
import { priceCart, orderInputSchema } from "@/server/orders";
import { dealsForCart } from "@/server/deals";
import { dealSummaryOf, showDealSummary } from "@/lib/deals";
import { getLocale, tFor } from "@/i18n/server";
import { errorResponse, json, limit, readJson } from "@/server/http";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { formatKm, isValidLatLng, quoteDelivery } from "@/lib/geo";

const schema = z.object({
  restaurantId: z.string().min(1),
  items: orderInputSchema.shape.items,
  fulfillment: z.enum(["DELIVERY", "PICKUP"]).optional(),
  addressId: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

/** Authoritative server-side quote shown before placing the order (prices + distance-based delivery fee). */
export async function POST(req: Request) {
  try {
    await limit("quote", 60, 60_000);
    const lang = await getLocale();
    const t = tFor(lang);
    const body = schema.parse(await readJson(req));
    const r = await prisma.restaurant.findFirst({ where: { id: body.restaurantId, status: "ACTIVE" } });
    if (!r) return json({ error: "This restaurant is not available" }, 404);
    const priced = await priceCart(body.restaurantId, body.items);
    let deliveryFeeCents: number | null = 0;
    let distanceKm: number | null = null;
    let deliveryError: string | null = null;
    if (body.fulfillment === "DELIVERY") {
      let point = isValidLatLng(body.latitude, body.longitude) ? { lat: body.latitude!, lng: body.longitude! } : null;
      if (body.addressId) {
        const user = await getCurrentUser();
        const a = user ? await prisma.customerAddress.findFirst({ where: { id: body.addressId, userId: user.id } }) : null;
        point = a?.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : null;
      }
      const q = quoteDelivery(r, point);
      if (q.deliverable) {
        deliveryFeeCents = q.feeCents;
        distanceKm = q.km;
      } else {
        deliveryFeeCents = null;
        distanceKm = q.km;
        deliveryError =
          q.reason === "out_of_range"
            ? t("This address is {km} away — {name} delivers up to {max}.", { km: formatKm(q.km!, lang), name: r.displayName, max: formatKm(q.maxKm, lang) })
            : q.reason === "no_location"
              ? t("Pin your delivery location on the map")
              : t("{name} hasn't set up delivery yet", { name: r.displayName });
      }
    }
    // Same deal logic as placing the order, so the preview equals the charge.
    const deal = await dealsForCart(body.restaurantId, priced.lines, priced.subtotalCents, deliveryFeeCents ?? 0);
    const fee = deliveryFeeCents == null ? null : deliveryFeeCents - deal.deliveryFeeWaivedCents;
    const itemName = (id: string) => priced.lines.find((l) => l.menuItemId === id)?.name ?? null;
    return json({
      subtotalCents: priced.subtotalCents,
      discountCents: deal.discountCents,
      deliveryFeeWaivedCents: deal.deliveryFeeWaivedCents,
      dealLabel: showDealSummary(t, dealSummaryOf(deal, priced.currency, itemName)),
      deliveryFeeCents: fee,
      distanceKm,
      deliveryError,
      totalCents: fee == null ? null : priced.subtotalCents - deal.discountCents + fee,
      currency: priced.currency,
      errors: priced.fieldErrors,
      lines: priced.lines.map((l) => ({ menuItemId: l.menuItemId, name: l.name, quantity: l.quantity, unitTotalCents: l.unitTotalCents, lineTotalCents: l.lineTotalCents })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
