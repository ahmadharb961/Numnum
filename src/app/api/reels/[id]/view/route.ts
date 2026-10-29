import { recordView } from "@/server/engagement";
import { errorResponse, json, limit, readJson } from "@/server/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await limit("view", 240, 60_000);
    const body = await readJson<{ watchMs?: number }>(req);
    return json(await recordView((await params).id, Number(body.watchMs)));
  } catch (e) {
    return errorResponse(e);
  }
}
