import "server-only";
import webpush from "web-push";
import { prisma } from "./db";

const PUB = "push.vapidPublic";
const PRIV = "push.vapidPrivate";
let keys: { publicKey: string; privateKey: string } | null = null;

/**
 * The key pair that signs notifications. Environment variables win; otherwise a pair is
 * created once and kept in the database (nothing to set up on Hostinger), as in Hireel.
 */
export async function vapidKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return keys;
  }
  const read = async () => Object.fromEntries((await prisma.platformSetting.findMany({ where: { key: { in: [PUB, PRIV] } } })).map((r) => [r.key, r.value as string]));
  let row = await read();
  if (!row[PUB] || !row[PRIV]) {
    const k = webpush.generateVAPIDKeys();
    await prisma.platformSetting.createMany({ data: [{ key: PUB, value: k.publicKey }, { key: PRIV, value: k.privateKey }], skipDuplicates: true });
    row = await read();
  }
  keys = { publicKey: row[PUB], privateKey: row[PRIV] };
  return keys;
}

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** Large picture shown in the notification (Android/desktop; iOS shows text only). */
  image?: string;
  /** Keep it on screen until the person taps or dismisses it. */
  requireInteraction?: boolean;
};

/** Sends to every device the given users turned notifications on for. Never throws. */
export async function pushToUsers(userIds: string[], msg: PushMessage) {
  try {
    if (!userIds.length) return 0;
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    if (!subs.length) return 0;
    const k = await vapidKeys();
    const app = process.env.APP_URL || "";
    webpush.setVapidDetails(app.startsWith("https://") ? app : `mailto:${process.env.SMTP_USER || "no-reply@localhost"}`, k.publicKey, k.privateKey);
    let sent = 0;
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: msg.requireInteraction ? 24 * 3600 : 60 * 60, timeout: 8000, urgency: "high" });
          sent++;
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          else console.error("push failed", code ?? e);
        }
      }),
    );
    return sent;
  } catch (e) {
    console.error("push error", e);
    return 0;
  }
}

export async function pushToRestaurantStaff(restaurantId: string, msg: PushMessage) {
  const staff = await prisma.restaurantStaff.findMany({ where: { restaurantId }, select: { userId: true } });
  return pushToUsers(staff.map((s) => s.userId), msg);
}
