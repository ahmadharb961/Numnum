import { prisma } from "@/server/db";
import { errorResponse, json } from "@/server/http";
import { isOpenAt, type OpeningHours } from "@/lib/hours";
import { normalizeZones } from "@/lib/geo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await prisma.restaurant.findFirst({
      where: { id: (await params).id, status: "ACTIVE" },
      select: { id: true, displayName: true, slug: true, phone: true, currency: true, deliveryEnabled: true, pickupEnabled: true, minOrderCents: true, orderingEnabled: true, agreementAcceptedAt: true, openingHours: true, avgPrepMinutes: true, address: true, latitude: true, longitude: true, deliveryZones: true },
    });
    if (!r) return json({ error: "Restaurant not available" }, 404);
    const { agreementAcceptedAt, openingHours, deliveryZones, ...pub } = r;
    const zones = normalizeZones(deliveryZones);
    return json({ ...pub, zones, deliveryEnabled: r.deliveryEnabled && zones.length > 0 && r.latitude != null, orderingEnabled: r.orderingEnabled && !!agreementAcceptedAt, openNow: isOpenAt(openingHours as OpeningHours) });
  } catch (e) {
    return errorResponse(e);
  }
}
