import type { Metadata } from "next";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage, Section } from "@/components/dashboard/page";
import { ItemForm } from "@/components/dashboard/item-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New item") };
}

export default async function NewItemPage() {
  const t = await getT();
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const [categories, foodCategories, groups] = await Promise.all([
    prisma.menuCategory.findMany({ where: { restaurantId: r.id }, orderBy: { sortOrder: "asc" } }),
    prisma.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.customizationGroup.findMany({ where: { restaurantId: r.id }, orderBy: { name: "asc" }, include: { _count: { select: { options: true } } } }),
  ]);
  return (
    <DashPage title={t("New menu item")}>
      <Section title={t("Details")}>
        <ItemForm item={null} currency={r.currency} categories={categories} foodCategories={foodCategories} groups={groups.map((g) => ({ id: g.id, name: g.name, type: g.type, optionCount: g._count.options }))} />
      </Section>
    </DashPage>
  );
}
