import type { Metadata } from "next";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { dashboardDeals } from "@/server/deals";
import { DashPage } from "@/components/dashboard/page";
import { DealsManager } from "@/components/dashboard/deals-manager";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Deals") };
}

export default async function DealsPage() {
  const t = await getT();
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const [{ live, ended }, items] = await Promise.all([
    dashboardDeals(r.id),
    prisma.menuItem.findMany({ where: { restaurantId: r.id, archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const shape = (d: (typeof live)[number]) => ({ id: d.id, kind: d.kind, percent: d.percent, amountCents: d.amountCents, minSubtotalCents: d.minSubtotalCents, itemName: d.menuItem?.name ?? null, startsAt: d.startsAt.toISOString(), endsAt: d.endsAt?.toISOString() ?? null, endedAt: d.endedAt?.toISOString() ?? null });
  return (
    <DashPage title={t("Deals")} description={t(r.followerCount === 1 ? "Offers that show on your reels, dishes and page, and apply automatically at checkout. Your follower is told about new deals." : "Offers that show on your reels, dishes and page, and apply automatically at checkout. Your {n} followers are told about new deals.", { n: r.followerCount })}>
      <DealsManager currency={r.currency} items={items} live={live.map(shape)} ended={ended.map(shape)} paused={r.restrictPromotion} />
    </DashPage>
  );
}
