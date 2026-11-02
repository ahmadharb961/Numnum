import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { customerVerdictOnOrder } from "@/server/orders";
import { errorResponse, json, limit, readJson } from "@/server/http";

const schema = z.object({ verdict: z.enum(["CONFIRMED", "RECEIVED", "NOT_CANCELED"]) });

/** The customer confirms or contradicts a rejected / not-delivered order. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit("order-verdict", 20, 60_000);
    const user = await getCurrentUser();
    if (!user) return json({ error: "Please log in" }, 401);
    const { verdict } = schema.parse(await readJson(req));
    const o = await customerVerdictOnOrder((await params).ref, user.id, verdict);
    return json({ ok: true, verdict: o.customerVerdict });
  } catch (e) {
    return errorResponse(e);
  }
}
