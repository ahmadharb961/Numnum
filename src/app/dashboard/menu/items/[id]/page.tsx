import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage, Section } from "@/components/dashboard/page";
import { ItemForm } from "@/components/dashboard/item-form";
import { ItemPhotos } from "@/components/dashboard/item-photos";
import { buttonClass } from "@/components/ui/button";
import { compactNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit item") };
}

export default async function EditItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const t = await getT();
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const item = await prisma.menuItem.findFirst({
    where: { id: (await params).id, restaurantId: r.id },
    include: { images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { asset: true } }, customizations: { orderBy: { sortOrder: "asc" } }, reels: { select: { id: true, visibility: true, viewCount: true } } },
  });
  if (!item) notFound();
  const [categories, foodCategories, groups] = await Promise.all([
    prisma.menuCategory.findMany({ where: { restaurantId: r.id }, orderBy: { sortOrder: "asc" } }),
    prisma.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.customizationGroup.findMany({ where: { restaurantId: r.id }, orderBy: { name: "asc" }, include: { _count: { select: { options: true } } } }),
  ]);
  return (
    <DashPage
      title={item.name}
      description={
        <>
          SKU <span className="font-mono">{item.sku}</span> · {t("{n} detail views", { n: compactNumber(item.viewCount) })} · {t("{n} reels", { n: item.reels.length })}
        </>
      }
      actions={
        <>
          <Link href={`/item/${item.id}`} target="_blank" className={buttonClass("outline", "sm")}>
            {t("View public page")}
          </Link>
          <Link href={`/dashboard/reels/new?item=${item.id}`} className={buttonClass("secondary", "sm")}>
            {t("Upload reel for this item")}
          </Link>
        </>
      }
    >
      <Section title={t("Photos")} description={t("The main photo is shown on menus. Tap the star to change it.")}>
        <ItemPhotos itemId={item.id} photos={item.images.map((i) => ({ id: i.id, url: i.asset.url, thumbUrl: i.asset.thumbUrl, isMain: i.isMain }))} />
      </Section>
      <Section title={t("Details")}>
        <ItemForm
          created={(await searchParams).created === "1"}
          item={{ ...item, groupIds: item.customizations.map((c) => c.groupId) }}
          currency={r.currency}
          categories={categories}
          foodCategories={foodCategories}
          groups={groups.map((g) => ({ id: g.id, name: g.name, type: g.type, optionCount: g._count.options }))}
        />
      </Section>
    </DashPage>
  );
}
