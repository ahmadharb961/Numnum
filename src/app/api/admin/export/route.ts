import Papa from "papaparse";
import { prisma } from "@/server/db";
import { getCurrentUser, hasRole } from "@/server/auth";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const period = url.searchParams.get("period") || undefined;
  let rows: Record<string, unknown>[] = [];
  if (type === "commissions") {
    const ev = await prisma.commissionEvent.findMany({ where: period ? { period } : {}, orderBy: { createdAt: "asc" }, include: { restaurant: { select: { displayName: true } }, invoice: { select: { number: true } } } });
    rows = ev.map((e) => ({ order_reference: e.orderReference, restaurant: e.restaurant.displayName, period: e.period, billable_event: e.billableEvent, base_usd: (e.baseCents / 100).toFixed(2), rate_pct: (e.rateBps / 100).toFixed(2), commission_usd: (e.commissionCents / 100).toFixed(2), status: e.status, invoice: e.invoice?.number ?? "", created_at: e.createdAt.toISOString() }));
  } else if (type === "invoices") {
    const inv = await prisma.invoice.findMany({ where: period ? { period } : {}, orderBy: { createdAt: "asc" }, include: { restaurant: { select: { displayName: true } } } });
    rows = inv.map((i) => ({ number: i.number, restaurant: i.restaurant.displayName, period: i.period, orders: i.orderCount, gross_subtotal_usd: (i.grossSubtotalCents / 100).toFixed(2), gross_commission_usd: (i.grossCommissionCents / 100).toFixed(2), adjustments_usd: (i.adjustmentsCents / 100).toFixed(2), total_due_usd: (i.totalDueCents / 100).toFixed(2), paid_usd: (i.paidCents / 100).toFixed(2), status: i.status, issued_at: i.issuedAt?.toISOString() ?? "", due_date: i.dueDate.toISOString() }));
  } else if (type === "payments") {
    const p = await prisma.payment.findMany({ orderBy: { createdAt: "asc" }, include: { invoice: { select: { number: true } }, restaurant: { select: { displayName: true } } } });
    rows = p.map((x) => ({ invoice: x.invoice.number, restaurant: x.restaurant.displayName, claimed_usd: (x.amountCents / 100).toFixed(2), verified_usd: x.verifiedAmountCents != null ? (x.verifiedAmountCents / 100).toFixed(2) : "", whish_reference: x.whishReference, method: x.method, status: x.status, payment_date: x.paymentDate.toISOString().slice(0, 10), reviewed_at: x.reviewedAt?.toISOString() ?? "" }));
  } else return new Response("Unknown export", { status: 400 });
  return new Response("﻿" + Papa.unparse(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="numnum-${type}${period ? `-${period}` : ""}.csv"`, "cache-control": "no-store" } });
}
