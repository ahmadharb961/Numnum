import { Suspense } from "react";
import { BottomNav } from "@/components/customer/bottom-nav";
import { DesktopSidebar } from "@/components/customer/desktop-sidebar";
import { ReviewPrompt } from "@/components/customer/review-prompt";
import { prisma } from "@/server/db";
import { customerLocation } from "@/server/location";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [categories, loc] = await Promise.all([prisma.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, emoji: true } }), customerLocation()]);
  return (
    <>
      <div className="lg:pl-64">{children}</div>
      <Suspense>
        <DesktopSidebar categories={categories} locationLabel={loc?.label ?? null} />
      </Suspense>
      <BottomNav />
      <ReviewPrompt />
    </>
  );
}
