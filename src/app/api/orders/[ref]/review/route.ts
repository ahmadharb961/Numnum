import { z } from "zod";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { submitOrderReview } from "@/server/reviews";
import { errorResponse, json, limit, readJson } from "@/server/http";

const star = z.number().int().min(1).max(5);
const schema = z.object({
  dismiss: z.boolean().optional(),
  restaurant: z.object({ rating: star, foodQuality: star.nullable().optional(), service: star.nullable().optional(), value: star.nullable().optional(), delivery: star.nullable().optional(), body: z.string().max(1500).nullable().optional() }).nullable().optional(),
  items: z.array(z.object({ menuItemId: z.string(), rating: z.number().int().min(0).max(5), body: z.string().max(1500).nullable().optional() })).max(20).default([]),
});

/** Post-delivery rating popup: submit ratings, or dismiss ("not now") so it stops asking. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit("order-review", 20, 60 * 60_000);
    const user = await getCurrentUser();
    if (!user) return json({ error: "Please log in" }, 401);
    const ref = (await params).ref;
    const body = schema.parse(await readJson(req));
    if (body.dismiss) {
      await prisma.order.updateMany({ where: { reference: ref, userId: user.id }, data: { reviewDismissedAt: new Date() } });
      return json({ ok: true });
    }
    await submitOrderReview(user, ref, { restaurant: body.restaurant ?? null, items: body.items });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
