import { loadCustomerOrder } from "@/server/order-view";
import { errorResponse, json, limit } from "@/server/http";

/** Lightweight status for the live tracking page (polled every ~15 s). */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit("order-status", 120, 60_000);
    const r = await loadCustomerOrder((await params).ref, new URL(req.url).searchParams.get("t"));
    if (!r) return json({ error: "Order not found" }, 404);
    const o = r.order;
    return json({ status: o.status, updatedAt: o.updatedAt.toISOString(), estimatedMinutes: o.estimatedMinutes, acceptedAt: o.acceptedAt?.toISOString() ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
