import { z } from "zod";
import { prisma } from "@/server/db";
import { errorResponse, json, limit, readJson } from "@/server/http";
import { ownerKey } from "@/server/engagement";
import { notifyAdmins } from "@/server/notifications";
import { getRestaurantContext } from "@/server/auth";

const schema = z.object({
  targetType: z.enum(["REEL", "ITEM_REVIEW", "RESTAURANT_REVIEW", "RESTAURANT", "MENU_ITEM"]),
  targetId: z.string().min(1).max(40),
  reason: z.enum(["Spam", "Offensive or inappropriate", "Misleading information", "Fake review", "Copyright", "Food safety concern", "Other"]),
  details: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  try {
    await limit("report", 10, 60 * 60_000);
    const data = schema.parse(await readJson(req));
    const key = await ownerKey();
    if (!key) return json({ error: "Enable cookies to report content" }, 400);
    const ctx = await getRestaurantContext();
    try {
      await prisma.report.create({ data: { ...data, reporterKey: key, reporterRestaurantId: ctx?.restaurant.id } });
    } catch {
      return json({ ok: true, duplicate: true });
    }
    await notifyAdmins({ type: "REPORT", title: `New report: ${data.reason}`, body: `${data.targetType} ${data.targetId}`, link: "/admin/moderation" });
    return json({ ok: true }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
