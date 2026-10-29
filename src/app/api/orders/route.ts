import { createOrder } from "@/server/orders";
import { errorResponse, json, limit, readJson } from "@/server/http";
import { deviceId, ipHash } from "@/server/request";

export async function POST(req: Request) {
  try {
    await limit("order", 20, 10 * 60_000);
    const body = await readJson(req);
    const order = await createOrder(body, { deviceKey: await deviceId(), ipHash: await ipHash() });
    return json(order, order.duplicateOf ? 200 : 201);
  } catch (e) {
    return errorResponse(e);
  }
}
