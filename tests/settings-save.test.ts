import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DEFAULT_SETTINGS, getSettings, updateSetting, updateSettings } from "@/server/settings";
import { resetDb } from "./helpers";

let adminId: string;
beforeEach(async () => {
  await resetDb();
  await prisma.platformSetting.deleteMany();
  adminId = (await prisma.user.create({ data: { email: "admin@test.dev", passwordHash: "x", name: "Admin" } })).id;
});

describe("saving a settings section", () => {
  it("writes every key of the section at once, new and existing ones alike", async () => {
    await updateSetting("graceDays", 3, adminId);
    const overduePolicy = { ...DEFAULT_SETTINGS.overduePolicy, autoApply: true, suspendAfterDays: 45 };
    const reminders = { ...DEFAULT_SETTINGS.reminders, daysAfterDue: [2, 9] };
    await updateSettings({ graceDays: 7, invoiceDueDays: 20, overduePolicy, reminders }, adminId);
    const s = await getSettings();
    expect(s).toMatchObject({ graceDays: 7, invoiceDueDays: 20, overduePolicy, reminders });
    const rows = await prisma.platformSetting.findMany({ orderBy: { key: "asc" } });
    expect(rows.map((r) => r.key)).toEqual(["graceDays", "invoiceDueDays", "overduePolicy", "reminders"]);
    expect(rows.every((r) => r.updatedBy === adminId)).toBe(true);
  });

  it("stores text exactly as typed and ignores unknown keys", async () => {
    const whish = { ...DEFAULT_SETTINGS.whish, recipientName: `O'Neil "SAL" \\ عربي`, instructions: "line 1\nline 2" };
    await updateSettings({ whish, ...({ notASetting: 1 } as object) }, adminId);
    expect((await getSettings()).whish).toEqual(whish);
    expect(await prisma.platformSetting.count()).toBe(1);
  });

  it("does nothing for an empty section", async () => {
    await updateSettings({}, adminId);
    expect(await prisma.platformSetting.count()).toBe(0);
  });
});
