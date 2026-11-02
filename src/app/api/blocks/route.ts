import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { block, unblock } from "@/server/blocks";
import { errorResponse, json, limit, readJson } from "@/server/http";

const schema = z.union([z.object({ restaurantId: z.string().min(1).max(40) }), z.object({ reviewId: z.string().min(1).max(40), reviewType: z.enum(["ITEM", "RESTAURANT"]) })]);

/** Block a restaurant or a reviewer (hide their content). */
export async function POST(req: Request) {
  try {
    await limit("block", 30, 60_000);
    const user = await getCurrentUser();
    if (!user) return json({ error: "Log in to report content", code: "LOGIN_REQUIRED" }, 401);
    const r = await block(user.id, schema.parse(await readJson(req)));
    if (!r) return json({ error: "Not found" }, 404);
    return json({ ok: true, ...r });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Unblock: { id } of the block. */
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "Please log in" }, 401);
    const { id } = z.object({ id: z.string().min(1).max(40) }).parse(await readJson(req));
    await unblock(user.id, id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
