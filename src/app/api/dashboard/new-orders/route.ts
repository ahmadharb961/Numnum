import { getRestaurantContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { json } from "@/server/http";

/** Polled by the dashboard to alert staff about orders waiting for acceptance. */
export async function GET() {
  const ctx = await getRestaurantContext();
  if (!ctx) return json({ error: "Unauthorized" }, 401);
  const pending = await prisma.order.findMany({ where: { restaurantId: ctx.restaurant.id, status: "PLACED" }, select: { id: true, reference: true }, orderBy: { createdAt: "desc" }, take: 20 });
  return json({ count: pending.length, ids: pending.map((p) => p.id) });
}
