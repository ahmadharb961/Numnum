import { z } from "zod";
import { toggleSave } from "@/server/engagement";
import { errorResponse, json, limit, readJson } from "@/server/http";
import { prisma } from "@/server/db";

const schema = z.object({ type: z.enum(["REEL", "ITEM", "RESTAURANT"]), refId: z.string().min(1).max(40) });

export async function POST(req: Request) {
  try {
    await limit("save", 60, 60_000);
    const { type, refId } = schema.parse(await readJson(req));
    const exists =
      type === "REEL"
        ? await prisma.reel.count({ where: { id: refId } })
        : type === "ITEM"
          ? await prisma.menuItem.count({ where: { id: refId } })
          : await prisma.restaurant.count({ where: { id: refId } });
    if (!exists) return json({ error: "Not found" }, 404);
    return json(await toggleSave(type, refId));
  } catch (e) {
    return errorResponse(e);
  }
}
