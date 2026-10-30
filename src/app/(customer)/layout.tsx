import { Suspense } from "react";
import { BottomNav } from "@/components/customer/bottom-nav";
import { DesktopSidebar } from "@/components/customer/desktop-sidebar";
import { ReviewPrompt } from "@/components/customer/review-prompt";
import { InstallGate } from "@/components/dashboard/install-gate";
import { prisma } from "@/server/db";
import { customerLocation } from "@/server/location";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [categories, loc] = await Promise.all([prisma.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, emoji: true, imageUrl: true } }), customerLocation()]);
  return (
    <>
      {/* Phones: numnum opens from the home screen with notifications on (order updates, offers). */}
      <InstallGate audience="customer">
        <div className="lg:pl-64">{children}</div>
      </InstallGate>
      <Suspense>
        <DesktopSidebar categories={categories} locationLabel={loc?.label ?? null} />
      </Suspense>
      <BottomNav />
      <ReviewPrompt />
    </>
  );
}
