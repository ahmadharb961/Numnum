import { notFound } from "next/navigation";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { syncStreamReels } from "@/server/stream";
import { DashPage } from "@/components/dashboard/page";
import { ReelEditor } from "@/components/dashboard/reel-editor";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { formatMoney } from "@/lib/money";
import { parseRange, reelInsight } from "@/server/insights";
import { ReelPerformance } from "@/components/dashboard/reel-performance";

export const metadata = { title: "Reel" };

export default async function ReelDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const ctx = await requireRestaurant("MANAGER");
  await syncStreamReels({ restaurantId: ctx.restaurant.id }).catch((e) => console.error("stream sync", e));
  const reel = await prisma.reel.findFirst({ where: { id: (await params).id, restaurantId: ctx.restaurant.id }, include: { menuItem: true } });
  if (!reel) notFound();
  const items = await prisma.menuItem.findMany({ where: { restaurantId: ctx.restaurant.id, archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, priceCents: true, currency: true } });
  const sp = await searchParams;
  // "All time" = since the reel was created (max one year of daily bars).
  const created = new Date(Date.UTC(reel.createdAt.getUTCFullYear(), reel.createdAt.getUTCMonth(), reel.createdAt.getUTCDate()));
  const end = new Date();
  end.setUTCHours(24, 0, 0, 0);
  const range = sp.days === "all" ? { from: new Date(Math.max(created.getTime(), end.getTime() - 366 * 86400_000)), to: end, label: "Since published" } : parseRange(sp);
  const perf = reel.status === "READY" ? await reelInsight(ctx.restaurant.id, reel.id, range) : null;
  return (
    <DashPage title={`Reel · ${reel.menuItem.name}`} description={`Shows ${reel.menuItem.name} at ${formatMoney(reel.menuItem.priceCents, reel.menuItem.currency)} (live price)`}>
      {reel.status === "PROCESSING" && <AutoRefresh seconds={5} />}
      {perf && <ReelPerformance reelId={reel.id} currency={ctx.restaurant.currency} rangeLabel={range.label} days={sp.days === "all" ? "all" : sp.from ? null : [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30} data={perf} />}
      <ReelEditor
        reel={{ id: reel.id, status: reel.status, visibility: reel.visibility, caption: reel.caption ?? "", videoUrl: reel.videoUrl, posterUrl: reel.posterUrl, menuItemId: reel.menuItemId, processingError: reel.processingError, removedReason: reel.removedReason }}
        items={items.map((i) => ({ id: i.id, label: `${i.name} · ${formatMoney(i.priceCents, i.currency)}`, sku: i.sku }))}
      />
    </DashPage>
  );
}
