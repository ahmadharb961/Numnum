import { getPublicItem } from "@/server/items";
import { errorResponse, json } from "@/server/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const item = await getPublicItem((await params).id);
    if (!item) return json({ error: "Item not found" }, 404);
    return json(item);
  } catch (e) {
    return errorResponse(e);
  }
}
