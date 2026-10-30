import { z } from "zod";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { vapidKeys, pushToUsers } from "@/server/push";
import { errorResponse, json, readJson } from "@/server/http";

const subSchema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }) });

/** Public key the browser needs to subscribe. */
export async function GET() {
  return json({ key: (await vapidKeys()).publicKey });
}

/** Save this device's subscription for the signed-in user (re-links it if another user had it). */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "Please log in" }, 401);
    const body = await readJson<Record<string, unknown>>(req);
    const sub = subSchema.parse(body);
    const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua },
      update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua, lastUsedAt: new Date() },
    });
    if ((body as { test?: boolean }).test) await pushToUsers([user.id], { title: "numnum notifications are on ✅", body: "You'll be alerted here for every new order.", url: "/dashboard/orders", tag: "test" });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ ok: true });
    const { endpoint } = await readJson<{ endpoint?: string }>(req);
    if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
