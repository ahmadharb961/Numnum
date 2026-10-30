import { prisma } from "@/server/db";
import { loadCustomerOrder } from "@/server/order-view";
import { getMainImages } from "@/server/menu";
import { errorResponse, json } from "@/server/http";

/**
 * Rebuilds cart lines from a past order using today's menu: unavailable items and
 * options that no longer exist are dropped, prices are current (re-checked again at checkout).
 */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const r = await loadCustomerOrder((await params).ref, new URL(req.url).searchParams.get("t"));
    if (!r) return json({ error: "Order not found" }, 404);
    const o = r.order;
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: o.restaurantId }, select: { id: true, slug: true, displayName: true, currency: true, status: true } });
    if (restaurant.status !== "ACTIVE") return json({ error: "This restaurant isn't available right now" }, 400);
    const items = await prisma.menuItem.findMany({ where: { id: { in: o.items.map((i) => i.menuItemId).filter(Boolean) as string[] }, archived: false, available: true }, include: { customizations: { include: { group: { include: { options: true } } } } } });
    const images = await getMainImages(items.map((i) => i.id));
    const lines = [];
    let skipped = 0;
    for (const oi of o.items) {
      const m = items.find((x) => x.id === oi.menuItemId);
      if (!m) {
        skipped++;
        continue;
      }
      const selections: Record<string, string[] | string> = {};
      const summary: string[] = [];
      let optionsCents = 0;
      for (const c of oi.customizations) {
        const g = m.customizations.map((x) => x.group).find((x) => x.name === c.groupName);
        if (!g) continue;
        if (g.type === "TEXT") {
          selections[g.id] = c.optionName;
          summary.push(`${g.name}: ${c.optionName}`);
          continue;
        }
        const opt = g.options.find((x) => x.id === c.optionId && x.available);
        if (!opt) continue;
        selections[g.id] = [...((selections[g.id] as string[]) ?? []), opt.id];
        optionsCents += opt.priceDeltaCents;
        summary.push(opt.name);
      }
      lines.push({ menuItemId: m.id, name: m.name, imageUrl: images.get(m.id)?.thumbUrl ?? null, unitBaseCents: m.priceCents, unitOptionsCents: optionsCents, quantity: oi.quantity, selections, summary, note: oi.specialInstructions, reelId: null });
    }
    return json({ restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.displayName, currency: restaurant.currency }, lines, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
