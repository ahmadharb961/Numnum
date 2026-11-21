import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { APP_DEVICE_ID, recordAppOpen } from "@/server/app-devices";
import { errorResponse, limit, readJson } from "@/server/http";

const schema = z.object({ id: z.string().regex(APP_DEVICE_ID), platform: z.enum(["ios", "android"]) });

/** The numnum store app opened (at most once a day per phone). Only the app itself reports. */
export async function POST(req: Request) {
  try {
    if (!/NumnumApp\//.test(req.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
    await limit("app-open", 20, 3600_000);
    const { id, platform } = schema.parse(await readJson(req, 2_000));
    const user = await getCurrentUser();
    await recordAppOpen(id, platform, user?.id ?? null);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
