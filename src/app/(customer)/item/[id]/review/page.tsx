import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { PageHeader } from "@/components/customer/page-header";
import { ItemReviewForm } from "@/components/customer/review-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Review dish"), robots: { index: false } };
}

export default async function ItemReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const id = (await params).id;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/item/${id}/review`);
  const item = await prisma.menuItem.findFirst({ where: { id, archived: false }, include: { restaurant: { select: { displayName: true } } } });
  if (!item) notFound();
  return (
    <main className="pb-nav">
      <PageHeader title={t("Review {name}", { name: item.name })} sub={item.restaurant.displayName} />
      <div className="container-app pt-5">
        <ItemReviewForm menuItemId={item.id} backHref={`/item/${item.id}`} hasPhone={!!user.phone} />
      </div>
    </main>
  );
}
