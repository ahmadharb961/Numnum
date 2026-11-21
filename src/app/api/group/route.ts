import { getCurrentUser } from "@/server/auth";
import { deviceId } from "@/server/request";
import { createGroup } from "@/server/group-carts";
import { errorResponse, json, limit, readJson } from "@/server/http";

/** Start a group order from the cart. */
export async function POST(req: Request) {
  try {
    await limit("group-create", 20, 3600_000);
    const device = await deviceId();
    if (!device) return json({ error: "Please reload the page and try again" }, 400);
    const user = await getCurrentUser();
    const body = await readJson<{ restaurantId?: string; name?: string; lines?: unknown }>(req, 64_000);
    const code = await createGroup({ device, userId: user?.id ?? null }, { restaurantId: String(body.restaurantId ?? ""), name: String(body.name ?? user?.name ?? ""), lines: body.lines ?? [] });
    return json({ code });
  } catch (e) {
    return errorResponse(e);
  }
}
