import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { setFollow } from "@/server/follows";
import { errorResponse, json, limit, readJson } from "@/server/http";

const schema = z.object({ restaurantId: z.string().min(1).max(40), follow: z.boolean() });

/** Follow / unfollow a restaurant (account required: guests get the log-in sheet). */
export async function POST(req: Request) {
  try {
    await limit("follow", 60, 60_000);
    const me = await getCurrentUser();
    if (!me) return json({ error: "Log in to follow restaurants" }, 401);
    const { restaurantId, follow } = schema.parse(await readJson(req));
    return json(await setFollow(me.id, restaurantId, follow));
  } catch (e) {
    return errorResponse(e);
  }
}
