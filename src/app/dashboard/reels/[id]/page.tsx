import { notFound } from "next/navigation";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { syncStreamReels } from "@/server/stream";
import { DashPage } from "@/components/dashboard/page";
import { ReelEditor } from "@/components/dashboard/reel-editor";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/ui/misc";
import { compactNumber } from "@/lib/utils";

export const metadata = { title: "Reel" };

export default async function ReelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRestaurant("MANAGER");
  await syncStreamReels({ restaurantId: ctx.restaurant.id }).catch((e) => console.error("stream sync", e));
  const reel = await prisma.reel.findFirst({ where: { id: (await params).id, restaurantId: ctx.restaurant.id }, include: { menuItem: true } });
  if (!reel) notFound();
  const items = await prisma.menuItem.findMany({ where: { restaurantId: ctx.restaurant.id, archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, priceCents: true, currency: true } });
  const rate = (n: number) => (reel.viewCount ? `${((n / reel.viewCount) * 100).toFixed(1)}% of views` : "—");
  return (
    <DashPage title={`Reel · ${reel.menuItem.name}`} description={`Shows ${reel.menuItem.name} at ${formatMoney(reel.menuItem.priceCents, reel.menuItem.currency)} (live price)`}>
      {reel.status === "PROCESSING" && <AutoRefresh seconds={5} />}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Qualified views" value={compactNumber(reel.viewCount)} />
        <StatCard label="Unique viewers" value={compactNumber(reel.uniqueViewers)} sub="estimated" />
        <StatCard label="Likes" value={compactNumber(reel.likeCount)} sub={rate(reel.likeCount)} />
        <StatCard label="Shares" value={compactNumber(reel.shareCount)} />
        <StatCard label="Product opens" value={compactNumber(reel.productOpens)} sub={rate(reel.productOpens)} />
        <StatCard label="Add to cart" value={compactNumber(reel.addToCarts)} />
        <StatCard label="Orders placed" value={compactNumber(reel.orderInits)} sub="from this reel" />
      </div>
      <ReelEditor
        reel={{ id: reel.id, status: reel.status, visibility: reel.visibility, caption: reel.caption ?? "", videoUrl: reel.videoUrl, posterUrl: reel.posterUrl, menuItemId: reel.menuItemId, processingError: reel.processingError, removedReason: reel.removedReason }}
        items={items.map((i) => ({ id: i.id, label: `${i.name} · ${formatMoney(i.priceCents, i.currency)}`, sku: i.sku }))}
      />
    </DashPage>
  );
}
