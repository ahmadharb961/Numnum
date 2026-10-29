import { recordHandoff } from "@/server/orders";
import { errorResponse, json, limit } from "@/server/http";
import { deviceId } from "@/server/request";

export async function POST(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit("handoff", 60, 10 * 60_000);
    return json(await recordHandoff((await params).ref, await deviceId()));
  } catch (e) {
    return errorResponse(e);
  }
}
