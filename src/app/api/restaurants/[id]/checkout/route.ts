import { prisma } from "@/server/db";
import { errorResponse, json } from "@/server/http";
import { isOpenAt, type OpeningHours } from "@/lib/hours";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await prisma.restaurant.findFirst({
      where: { id: (await params).id, status: "ACTIVE" },
      select: { id: true, displayName: true, slug: true, phone: true, currency: true, deliveryEnabled: true, pickupEnabled: true, requireMapsLocation: true, deliveryFeeCents: true, minOrderCents: true, orderingEnabled: true, agreementAcceptedAt: true, openingHours: true, avgPrepMinutes: true, address: true, deliveryAreas: { select: { name: true, feeCents: true }, orderBy: { name: "asc" } } },
    });
    if (!r) return json({ error: "Restaurant not available" }, 404);
    const { agreementAcceptedAt, openingHours, ...pub } = r;
    const deliveryConfigured = r.deliveryAreas.length ? r.deliveryAreas.some((a) => a.feeCents != null) || r.deliveryFeeCents != null : r.deliveryFeeCents != null;
    return json({ ...pub, deliveryEnabled: r.deliveryEnabled && deliveryConfigured, orderingEnabled: r.orderingEnabled && !!agreementAcceptedAt, openNow: isOpenAt(openingHours as OpeningHours) });
  } catch (e) {
    return errorResponse(e);
  }
}
