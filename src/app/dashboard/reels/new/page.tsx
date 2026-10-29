import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { ReelUploader } from "@/components/dashboard/reel-uploader";
import { Alert } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Upload reel" };

export default async function NewReelPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const ctx = await requireRestaurant("MANAGER");
  const items = await prisma.menuItem.findMany({ where: { restaurantId: ctx.restaurant.id, archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, priceCents: true, currency: true } });
  return (
    <DashPage title="Upload a reel" description="Vertical 9:16 video, up to 3 minutes and 200 MB. We optimise it for fast mobile playback.">
      {ctx.restaurant.status !== "ACTIVE" && <Alert className="mb-4">Your profile isn't live yet, so reels will be saved as drafts. Publish them once your restaurant is approved.</Alert>}
      {ctx.restaurant.restrictReels ? (
        <Alert tone="red">New reels are restricted on your account until outstanding invoices are settled.</Alert>
      ) : (
        <ReelUploader items={items.map((i) => ({ id: i.id, label: `${i.name} · ${formatMoney(i.priceCents, i.currency)}`, sku: i.sku }))} defaultItemId={(await searchParams).item} canPublish={ctx.restaurant.status === "ACTIVE"} />
      )}
    </DashPage>
  );
}
