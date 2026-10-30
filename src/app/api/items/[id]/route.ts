import { getPublicItem } from "@/server/items";
import { errorResponse, json } from "@/server/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const item = await getPublicItem((await params).id);
    if (!item) return json({ error: "Item not found" }, 404);
    const res = json(item);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
