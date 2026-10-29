import { z } from "zod";
import { ANALYTICS_EVENTS, trackEvent } from "@/server/engagement";
import { errorResponse, json, limit, readJson } from "@/server/http";

const schema = z.object({
  type: z.enum(ANALYTICS_EVENTS),
  reelId: z.string().max(40).optional(),
  menuItemId: z.string().max(40).optional(),
  restaurantId: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  try {
    await limit("track", 300, 60_000);
    const parsed = schema.safeParse(await readJson(req, 4000));
    if (!parsed.success) return json({ ok: false }, 400);
    const { type, ...refs } = parsed.data;
    await trackEvent(type, refs);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
