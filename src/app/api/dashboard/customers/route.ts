import { canAccess, getRestaurantContext } from "@/server/auth";
import { restaurantCustomersCsv } from "@/server/restaurant-customers";
import { slugify } from "@/lib/slug";

/** Dashboard → Customers → Download CSV (owners and managers). */
export async function GET() {
  const ctx = await getRestaurantContext();
  if (!ctx) return new Response("Not found", { status: 404 });
  if (!canAccess(ctx.staffRole, "MANAGER")) return new Response("Forbidden", { status: 403 });
  const csv = await restaurantCustomersCsv(ctx.restaurant.id, ctx.restaurant.currency);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slugify(ctx.restaurant.displayName) || "restaurant"}-customers-${day}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
