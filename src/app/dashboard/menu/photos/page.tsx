import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { BulkPhotos } from "@/components/dashboard/bulk-photos";

export const metadata = { title: "Menu photos" };

export default async function PhotosPage() {
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const [items, library] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: r.id, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, sku: true, name: true, images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], select: { id: true, assetId: true, isMain: true, asset: { select: { thumbUrl: true, url: true } } } } },
    }),
    prisma.mediaAsset.findMany({ where: { restaurantId: r.id, kind: "IMAGE" }, orderBy: { createdAt: "desc" }, take: 600, select: { id: true, url: true, thumbUrl: true, originalName: true, _count: { select: { itemImages: true } } } }),
  ]);
  const withPhotos = items.filter((i) => i.images.length).length;
  return (
    <DashPage title="Menu photos" description={`${withPhotos} of ${items.length} items have photos`}>
      <BulkPhotos
        items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, images: i.images.map((im) => ({ id: im.id, assetId: im.assetId, isMain: im.isMain, thumbUrl: im.asset.thumbUrl ?? im.asset.url })) }))}
        library={library.map((a) => ({ id: a.id, thumbUrl: a.thumbUrl ?? a.url, name: a.originalName, used: a._count.itemImages }))}
      />
    </DashPage>
  );
}
