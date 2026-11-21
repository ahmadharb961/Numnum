import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { appStats, recordAppOpen } from "@/server/app-devices";
import { makeCustomer, resetDb } from "./helpers";

describe("store app installs (Admin → Overview)", () => {
  beforeEach(resetDb);

  it("counts installs, active phones, new this week, notifications and logged-in users per platform", async () => {
    const u = await makeCustomer();
    const now = new Date();
    await recordAppOpen("android-phone-0000000001", "android", null);
    await recordAppOpen("android-phone-0000000001", "android", u.id); // same phone, later logged in: still 1 install
    await recordAppOpen("android-phone-0000000002", "android", null);
    await recordAppOpen("iphone-phone-00000000001", "ios", u.id);
    // An old install not opened for 2 months: counted as installed, not active.
    await prisma.appDevice.create({ data: { id: "android-old-000000000001", platform: "android", firstSeenAt: new Date(now.getTime() - 70 * 86_400_000), lastSeenAt: new Date(now.getTime() - 60 * 86_400_000) } });
    await recordAppOpen("android-phone-0000000002", "android", null); // logged out later: keeps nothing / no account
    await prisma.pushSubscription.create({ data: { endpoint: "native:android:tok_aaaaaaaaaaaaaaaaaaaaaaaa", p256dh: "-", auth: "-", userId: u.id } });
    await prisma.pushSubscription.create({ data: { endpoint: "https://fcm.googleapis.com/web-push/x", p256dh: "k", auth: "a" } }); // a browser, not the app

    const s = await appStats(now);
    expect(s.android).toEqual({ installs: 3, active: 2, newThisWeek: 2, notifications: 1 });
    expect(s.ios).toEqual({ installs: 1, active: 1, newThisWeek: 1, notifications: 0 });
    expect(s.loggedIn).toBe(1); // one person on two phones
    expect((await prisma.appDevice.findUniqueOrThrow({ where: { id: "android-phone-0000000001" } })).userId).toBe(u.id);
  });

  it("logging out keeps the phone's last account; bad ids are refused", async () => {
    const u = await makeCustomer();
    await recordAppOpen("phone-keeps-account-0001", "ios", u.id);
    await recordAppOpen("phone-keeps-account-0001", "ios", null);
    expect((await prisma.appDevice.findUniqueOrThrow({ where: { id: "phone-keeps-account-0001" } })).userId).toBe(u.id);
    await expect(recordAppOpen("short", "ios", null)).rejects.toThrow();
    await expect(recordAppOpen("bad id with spaces!!!!!", "ios", null)).rejects.toThrow();
  });
});
