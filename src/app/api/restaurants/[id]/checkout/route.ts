import { prisma } from "@/server/db";
import { errorResponse, json } from "@/server/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await prisma.restaurant.findFirst({
      where: { id: (await params).id, status: "ACTIVE" },
      select: { id: true, displayName: true, slug: true, currency: true, deliveryEnabled: true, pickupEnabled: true, requireMapsLocation: true, deliveryFeeCents: true, minOrderCents: true, orderingEnabled: true, agreementAcceptedAt: true, whatsappNumber: true, openingHours: true, deliveryAreas: { select: { name: true, feeCents: true }, orderBy: { name: "asc" } } },
    });
    if (!r) return json({ error: "Restaurant not available" }, 404);
    const { whatsappNumber, agreementAcceptedAt, ...pub } = r;
    return json({ ...pub, orderingEnabled: r.orderingEnabled && !!agreementAcceptedAt && !!whatsappNumber });
  } catch (e) {
    return errorResponse(e);
  }
}
