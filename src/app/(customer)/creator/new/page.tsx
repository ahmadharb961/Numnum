import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { streamConfigured } from "@/server/stream";
import { DAILY_REELS, dishesToTag } from "@/server/creators";
import { PageHeader } from "@/components/customer/page-header";
import { ReelComposer } from "@/components/creator/reel-composer";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Post a reel"), robots: { index: false } };
}

export default async function NewCreatorReelPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser("/creator/new");
  const c = await prisma.creator.findUnique({ where: { userId: me.id }, select: { id: true, status: true } });
  if (c?.status !== "APPROVED") redirect("/creator");
  // From "Restaurants to shoot": the dish search starts with that restaurant.
  const q = String((await searchParams).q ?? "").slice(0, 60);
  const initialDishes = q ? await dishesToTag(me.id, q) : [];
  const today = await prisma.reel.count({ where: { creatorId: c.id, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  return (
    <div className="pb-nav">
      <PageHeader title="Post a reel" />
      <div className="container-app max-w-xl py-5">
        <ReelComposer stream={streamConfigured()} dailyLeft={Math.max(0, DAILY_REELS - today)} initialQuery={q} initialDishes={initialDishes} />
      </div>
    </div>
  );
}
