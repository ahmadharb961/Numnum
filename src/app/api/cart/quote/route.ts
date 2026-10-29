import { z } from "zod";
import { priceCart, orderInputSchema } from "@/server/orders";
import { errorResponse, json, limit, readJson } from "@/server/http";
import { prisma } from "@/server/db";

const schema = z.object({ restaurantId: z.string().min(1), items: orderInputSchema.shape.items });

/** Authoritative server-side quote shown before confirming. */
export async function POST(req: Request) {
  try {
    await limit("quote", 60, 60_000);
    const { restaurantId, items } = schema.parse(await readJson(req));
    const r = await prisma.restaurant.findFirst({ where: { id: restaurantId, status: "ACTIVE" }, select: { id: true } });
    if (!r) return json({ error: "This restaurant is not available" }, 404);
    const priced = await priceCart(restaurantId, items);
    return json({
      subtotalCents: priced.subtotalCents,
      currency: priced.currency,
      errors: priced.fieldErrors,
      lines: priced.lines.map((l) => ({ menuItemId: l.menuItemId, name: l.name, quantity: l.quantity, unitTotalCents: l.unitTotalCents, lineTotalCents: l.lineTotalCents })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
