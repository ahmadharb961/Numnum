import { createOrder } from "@/server/orders";
import { errorResponse, json, limit, readJson } from "@/server/http";
import { deviceId, ipHash } from "@/server/request";
import { getCurrentUser } from "@/server/auth";

export async function POST(req: Request) {
  try {
    await limit("order", 15, 10 * 60_000);
    const body = await readJson(req);
    const user = await getCurrentUser();
    const order = await createOrder(body, { deviceKey: await deviceId(), ipHash: await ipHash(), userId: user?.id ?? null });
    return json(order, order.duplicate ? 200 : 201);
  } catch (e) {
    return errorResponse(e);
  }
}
