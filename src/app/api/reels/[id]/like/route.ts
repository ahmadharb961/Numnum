import { toggleLike } from "@/server/engagement";
import { errorResponse, json, limit } from "@/server/http";
import { prisma } from "@/server/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await limit("like", 60, 60_000);
    const id = (await params).id;
    const reel = await prisma.reel.findFirst({ where: { id, visibility: "PUBLISHED" }, select: { id: true } });
    if (!reel) return json({ error: "Reel not found" }, 404);
    return json(await toggleLike(id));
  } catch (e) {
    return errorResponse(e);
  }
}
