import Link from "next/link";
import { Plus, Upload, Image as ImageIcon } from "lucide-react";
import { requireRestaurant, canAccess } from "@/server/auth";
import { prisma } from "@/server/db";
import { getMainImages } from "@/server/menu";
import { DashPage } from "@/components/dashboard/page";
import { MenuManager } from "@/components/dashboard/menu-manager";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Menu" };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const ctx = await requireRestaurant();
  const r = ctx.restaurant;
  const showArchived = (await searchParams).archived === "1";
  const [categories, items] = await Promise.all([
    prisma.menuCategory.findMany({ where: { restaurantId: r.id }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { items: { where: { archived: false } } } } } }),
    prisma.menuItem.findMany({ where: { restaurantId: r.id, archived: showArchived }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, sku: true, name: true, priceCents: true, currency: true, available: true, menuCategoryId: true, ratingAvg: true, ratingCount: true, _count: { select: { images: true, reels: true, customizations: true } } } }),
  ]);
  const images = await getMainImages(items.map((i) => i.id));
  const manager = canAccess(ctx.staffRole, "MANAGER");
  return (
    <DashPage
      title="Menu"
      description={`${items.length} ${showArchived ? "archived" : "active"} items · ${categories.length} categories`}
      actions={
        manager && (
          <>
            <Link href="/dashboard/menu/import" className={buttonClass("outline", "sm")}>
              <Upload className="h-4 w-4" /> Import CSV
            </Link>
            <Link href="/dashboard/menu/photos" className={buttonClass("outline", "sm")}>
              <ImageIcon className="h-4 w-4" /> Photos
            </Link>
            <Link href="/dashboard/menu/items/new" className={buttonClass("primary", "sm")}>
              <Plus className="h-4 w-4" /> Add item
            </Link>
          </>
        )
      }
    >
      <MenuManager
        manager={manager}
        showArchived={showArchived}
        categories={categories.map((c) => ({ id: c.id, name: c.name, count: c._count.items }))}
        items={items.map((i) => ({ ...i, image: images.get(i.id)?.thumbUrl ?? images.get(i.id)?.url ?? null }))}
      />
    </DashPage>
  );
}
