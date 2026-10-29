import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { PageHeader } from "@/components/customer/page-header";
import { RestaurantReviewForm } from "@/components/customer/review-forms";

export const metadata = { title: "Review restaurant", robots: { index: false } };

export default async function RestaurantReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/r/${slug}/review`);
  const r = await prisma.restaurant.findFirst({ where: { slug, status: "ACTIVE" } });
  if (!r) notFound();
  return (
    <main className="pb-nav">
      <PageHeader title={`Review ${r.displayName}`} />
      <div className="container-app pt-5">
        <RestaurantReviewForm restaurantId={r.id} backHref={`/r/${r.slug}#reviews`} hasPhone={!!user.phone} />
      </div>
    </main>
  );
}
