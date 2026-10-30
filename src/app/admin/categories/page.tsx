import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { CategoryAdmin } from "@/components/admin/category-admin";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const cats = await prisma.foodCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { items: true } } } });
  return (
    <DashPage title="Food categories" description="Used for Explore filters, category pages and feed relevance.">
      <CategoryAdmin categories={cats.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr ?? "", emoji: c.emoji ?? "", imageUrl: c.imageUrl ?? "", sortOrder: c.sortOrder, active: c.active, slug: c.slug, count: c._count.items }))} />
    </DashPage>
  );
}
