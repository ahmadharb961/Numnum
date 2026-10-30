import { customerCancelOrder } from "@/server/orders";
import { errorResponse, json, limit, readJson } from "@/server/http";
import { getCurrentUser } from "@/server/auth";
import { deviceId } from "@/server/request";

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit("order-cancel", 10, 10 * 60_000);
    const body = await readJson<{ token?: string; reason?: string }>(req);
    const user = await getCurrentUser();
    await customerCancelOrder((await params).ref, { userId: user?.id ?? null, deviceKey: await deviceId(), token: body.token }, body.reason);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
