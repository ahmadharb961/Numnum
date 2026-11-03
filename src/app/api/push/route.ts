import { z } from "zod";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { vapidKeys, pushToDevices } from "@/server/push";
import { nativeEndpoint } from "@/server/native-push";
import { errorResponse, json, readJson } from "@/server/http";

const subSchema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }) });
/** The numnum store app: the phone's own notification token (APNs on iPhone, FCM on Android). */
const nativeSchema = z.object({ native: z.object({ platform: z.enum(["ios", "android"]), token: z.string().regex(/^[A-Za-z0-9:_\-]{20,500}$/) }) });

function parseDevice(body: Record<string, unknown>) {
  if (body.native) {
    const { native } = nativeSchema.parse(body);
    // Web push keys don't apply to the app: the table keeps "-" there.
    return { endpoint: nativeEndpoint(native.platform, native.token), keys: { p256dh: "-", auth: "-" } };
  }
  return subSchema.parse(body);
}

/** Public key the browser needs to subscribe. */
export async function GET() {
  return json({ key: (await vapidKeys()).publicKey });
}

/** Save this device's subscription for the signed-in user (re-links it if another user had it). */
export async function POST(req: Request) {
  try {
    // Guests can turn notifications on too; the device is linked to their account once they log in.
    const user = await getCurrentUser();
    const body = await readJson<Record<string, unknown>>(req);
    const sub = parseDevice(body);
    const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId: user?.id ?? null, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua },
      // A guest re-saving a device doesn't unlink it from the account that owns it.
      update: { ...(user ? { userId: user.id } : {}), p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua, lastUsedAt: new Date() },
    });
    if ((body as { test?: boolean }).test) {
      const staff = user ? await prisma.restaurantStaff.count({ where: { userId: user.id } }) : 0;
      await pushToDevices({ endpoint: sub.endpoint }, staff ? { title: "numnum notifications are on ✅", body: "You'll be alerted here for every new order.", url: "/dashboard/orders", tag: "test" } : { title: "numnum notifications are on ✅", body: "You'll get your order updates and the best offers here.", url: "/", tag: "test" });
    }
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
