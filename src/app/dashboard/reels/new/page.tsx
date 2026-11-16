import type { Metadata } from "next";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { ReelUploader } from "@/components/dashboard/reel-uploader";
import { Alert } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { streamConfigured } from "@/server/stream";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Upload reel") };
}

export default async function NewReelPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const t = await getT();
  const ctx = await requireRestaurant("MANAGER");
  const items = await prisma.menuItem.findMany({ where: { restaurantId: ctx.restaurant.id, archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, priceCents: true, currency: true } });
  return (
    <DashPage title={t("Upload a reel")} description={t("Vertical 9:16 video, up to 3 minutes. We optimise it for fast playback on mobile networks.")}>
      {ctx.restaurant.status !== "ACTIVE" && <Alert className="mb-4">Your profile isn&apos;t live yet, so reels will be saved as drafts. Publish them once your restaurant is approved.</Alert>}
      {ctx.restaurant.restrictReels ? (
        <Alert tone="red">{t("New reels are restricted on your account until outstanding invoices are settled.")}</Alert>
      ) : (
        <ReelUploader items={items.map((i) => ({ id: i.id, label: `${i.name} · ${formatMoney(i.priceCents, i.currency)}`, sku: i.sku }))} defaultItemId={(await searchParams).item} canPublish={ctx.restaurant.status === "ACTIVE"} stream={streamConfigured()} />
      )}
    </DashPage>
  );
}
