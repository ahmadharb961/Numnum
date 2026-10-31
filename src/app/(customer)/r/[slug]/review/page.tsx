import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { PageHeader } from "@/components/customer/page-header";
import { RestaurantReviewForm } from "@/components/customer/review-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Review restaurant"), robots: { index: false } };
}

export default async function RestaurantReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getT();
  const slug = (await params).slug;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/r/${slug}/review`);
  const r = await prisma.restaurant.findFirst({ where: { slug, status: "ACTIVE" } });
  if (!r) notFound();
  return (
    <main className="pb-nav">
      <PageHeader title={t("Review {name}", { name: r.displayName })} />
      <div className="container-app pt-5">
        <RestaurantReviewForm restaurantId={r.id} backHref={`/r/${r.slug}#reviews`} hasPhone={!!user.phone} />
      </div>
    </main>
  );
}
