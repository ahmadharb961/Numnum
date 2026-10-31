import type { Metadata } from "next";
import { requireRestaurant, canAccess } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { ReviewList } from "@/components/dashboard/review-list";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Reviews") };
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getT();
  const ctx = await requireRestaurant();
  const tab = (await searchParams).tab === "restaurant" ? "restaurant" : "item";
  const r = ctx.restaurant;
  const reviews =
    tab === "item"
      ? (await prisma.itemReview.findMany({ where: { restaurantId: r.id, status: { not: "REMOVED" } }, orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } }, menuItem: { select: { name: true } } } })).map((x) => ({ id: x.id, rating: x.rating, body: x.body, reply: x.reply, createdAt: x.createdAt.toISOString(), user: x.user.name, subject: x.menuItem.name, evidence: x.evidence, hidden: x.status === "HIDDEN" }))
      : (await prisma.restaurantReview.findMany({ where: { restaurantId: r.id, status: { not: "REMOVED" } }, orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } })).map((x) => ({ id: x.id, rating: x.rating, body: x.body, reply: x.reply, createdAt: x.createdAt.toISOString(), user: x.user.name, subject: [x.foodQuality && `Food ${x.foodQuality}★`, x.service && `Service ${x.service}★`, x.value && `Value ${x.value}★`, x.delivery && `Delivery ${x.delivery}★`].filter(Boolean).join(" · "), evidence: x.evidence, hidden: x.status === "HIDDEN" }));
  return (
    <DashPage title={t("Reviews")} description={r.ratingCount ? t("Restaurant rating {avg} ★ from {n} reviews", { avg: r.ratingAvg.toFixed(1), n: r.ratingCount }) : t("Restaurant rating — no reviews yet")}>
      <div className="mb-4 flex gap-2">
        <Link href="/dashboard/reviews" className={cn("chip", tab === "item" && "chip-active")}>
          {t("Dish reviews")}
        </Link>
        <Link href="/dashboard/reviews?tab=restaurant" className={cn("chip", tab === "restaurant" && "chip-active")}>
          {t("Restaurant reviews")}
        </Link>
      </div>
      <ReviewList kind={tab} reviews={reviews} canReply={canAccess(ctx.staffRole, "MANAGER")} />
    </DashPage>
  );
}
