import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/server/db";
import { searchDishes, searchReels } from "@/server/search";
import { DishCard, ReelThumb } from "@/components/customer/cards";
import { PageHeader } from "@/components/customer/page-header";
import { EmptyState } from "@/components/ui/misc";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await prisma.foodCategory.findUnique({ where: { slug: (await params).slug } });
  if (!c) return {};
  return { title: `${c.name} in Lebanon`, description: `Watch ${c.name.toLowerCase()} reels and order with cash on delivery.`, alternates: { canonical: `/category/${c.slug}` } };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const c = await prisma.foodCategory.findFirst({ where: { slug, active: true } });
  if (!c) notFound();
  const [dishes, reels] = await Promise.all([searchDishes({ category: slug, page: 1 }), searchReels({ category: slug, page: 1 })]);
  return (
    <main className="pb-nav">
      <PageHeader title={`${c.emoji ?? ""} ${c.name}`} />
      <div className="container-app space-y-6 pt-4">
        {reels.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-extrabold">Reels</h2>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {reels.slice(0, 12).map((r) => (
                <ReelThumb key={r.id} href={`/reel/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} className="w-28 shrink-0 rounded-xl" label={r.item.name} />
              ))}
            </div>
          </section>
        )}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Dishes</h2>
            <Link href={`/explore?category=${slug}`} className="text-sm font-semibold text-brand-600">
              Filter
            </Link>
          </div>
          {dishes.items.length ? <div className="grid gap-2.5">{dishes.items.map((i) => <DishCard key={i.id} item={i} />)}</div> : <EmptyState title={`No ${c.name.toLowerCase()} yet`} />}
        </section>
      </div>
    </main>
  );
}
