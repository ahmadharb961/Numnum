import Papa from "papaparse";
import { getRestaurantContext, canAccess } from "@/server/auth";
import { parseRange, restaurantInsights } from "@/server/insights";

export async function GET(req: Request) {
  const ctx = await getRestaurantContext();
  if (!ctx || !canAccess(ctx.staffRole, "MANAGER")) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const ins = await restaurantInsights(ctx.restaurant.id, parseRange(sp));
  const d = ins.restaurant.currency === "LBP" ? 1 : 100;
  const rows = ins.orders.map((o) => ({ date: o.createdAt, reference: o.reference, customer: o.customer, type: o.fulfillment, items: o.items, subtotal: (o.subtotalCents / d).toFixed(d === 1 ? 0 : 2), delivery_fee: (o.deliveryFeeCents / d).toFixed(d === 1 ? 0 : 2), total: (o.totalCents / d).toFixed(d === 1 ? 0 : 2), currency: ins.restaurant.currency, status: o.status }));
  return new Response("﻿" + Papa.unparse(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="numnum-orders-${ins.range.from.toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" } });
}
