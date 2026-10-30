import { getRestaurantContext, canAccess } from "@/server/auth";
import { parseRange, restaurantInsights } from "@/server/insights";
import { insightsPdf } from "@/server/insights-pdf";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await getRestaurantContext();
  if (!ctx || !canAccess(ctx.staffRole, "MANAGER")) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const ins = await restaurantInsights(ctx.restaurant.id, parseRange(sp));
  const bytes = await insightsPdf(ins, (await getSettings()).platformName);
  const name = `${ctx.restaurant.slug}-insights-${ins.range.from.toISOString().slice(0, 10)}.pdf`;
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
}
