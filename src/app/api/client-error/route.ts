import { z } from "zod";
import { prisma } from "@/server/db";
import { deviceId } from "@/server/request";
import { errorResponse, json, limit, readJson } from "@/server/http";

const lines = z.array(z.string().max(300)).max(15).optional();
const schema = z.object({
  path: z.string().max(300),
  message: z.string().max(300),
  stack: z.string().max(1500).nullable().optional(),
  hydration: z.boolean().optional(),
  serverOnly: lines,
  clientOnly: lines,
});

/** Page errors from real phones (see error-reporter-script.ts), listed in Admin → Settings → App health. */
export async function POST(req: Request) {
  try {
    await limit("client-error", 20, 60_000);
    const parsed = schema.safeParse(await readJson(req, 12_000));
    if (!parsed.success) return json({ ok: false }, 400);
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
    await prisma.analyticsEvent.create({ data: { type: "client_error", deviceKey: await deviceId(), data: { ...parsed.data, ua } } });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
