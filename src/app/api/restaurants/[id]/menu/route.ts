import { prisma } from "@/server/db";
import { errorResponse, json } from "@/server/http";
import { getPublicRestaurant } from "@/server/restaurant-public";
import { isOpenAt, type OpeningHours } from "@/lib/hours";

/** Restaurant summary + menu for the desktop restaurant panel next to the reels. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await prisma.restaurant.findFirst({ where: { id: (await params).id, status: "ACTIVE" }, select: { slug: true } });
    const data = r && (await getPublicRestaurant(r.slug));
    if (!data) return json({ error: "Restaurant not available" }, 404);
    const { restaurant: x, sections } = data;
    return json({
      description: x.description,
      openNow: isOpenAt(x.openingHours as OpeningHours),
      reelCount: x._count.reels,
      sections: sections.map((s) => ({ id: s.id, name: s.name, items: s.items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, currency: i.currency, available: i.available, image: i.image?.thumbUrl ?? i.image?.url ?? null })) })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
