import "server-only";
import { prisma } from "./db";
import { NATIVE_PREFIX } from "./native-push";

// Phones with the numnum store app: counted when the app opens (see components/app-open-ping.tsx).

export type AppPlatform = "ios" | "android";
export const APP_DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ACTIVE_DAYS = 30;

/** The app opened on this phone: first time → a new install; later → still in use. */
export async function recordAppOpen(id: string, platform: AppPlatform, userId: string | null) {
  if (!APP_DEVICE_ID.test(id)) throw Object.assign(new Error("Bad device id"), { status: 400 });
  const now = new Date();
  await prisma.appDevice.upsert({
    where: { id },
    create: { id, platform, userId, firstSeenAt: now, lastSeenAt: now },
    // Logged out keeps the last account (it's still that person's phone).
    update: { platform, lastSeenAt: now, ...(userId ? { userId } : {}) },
  });
}

/** Admin → Overview: installs, phones using the app lately, and phones with notifications on. */
export async function appStats(now = new Date()) {
  const since = new Date(now.getTime() - ACTIVE_DAYS * 86_400_000);
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const per = async (platform: AppPlatform) => {
    const [installs, active, newThisWeek, notifications] = await Promise.all([
      prisma.appDevice.count({ where: { platform } }),
      prisma.appDevice.count({ where: { platform, lastSeenAt: { gte: since } } }),
      prisma.appDevice.count({ where: { platform, firstSeenAt: { gte: week } } }),
      prisma.pushSubscription.count({ where: { endpoint: { startsWith: `${NATIVE_PREFIX}${platform}:` } } }),
    ]);
    return { installs, active, newThisWeek, notifications };
  };
  const [android, ios, loggedIn, first] = await Promise.all([
    per("android"),
    per("ios"),
    prisma.appDevice.findMany({ where: { userId: { not: null }, lastSeenAt: { gte: since } }, distinct: ["userId"], select: { userId: true } }).then((r) => r.length),
    prisma.appDevice.findFirst({ orderBy: { firstSeenAt: "asc" }, select: { firstSeenAt: true } }),
  ]);
  return { android, ios, loggedIn, since: first?.firstSeenAt ?? null, activeDays: ACTIVE_DAYS };
}
