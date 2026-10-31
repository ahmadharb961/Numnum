import { BottomNav } from "@/components/customer/bottom-nav";
import { DesktopSidebar } from "@/components/customer/desktop-sidebar";
import { ReviewPrompt } from "@/components/customer/review-prompt";
import { prisma } from "@/server/db";
import { customerLocation } from "@/server/location";
import { getCurrentUser } from "@/server/auth";
import { LoginGateProvider } from "@/components/customer/login-gate";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [categories, loc, user] = await Promise.all([prisma.foodCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, nameAr: true, emoji: true, imageUrl: true } }), customerLocation(), getCurrentUser()]);
  return (
    <LoginGateProvider loggedIn={!!user}>
      {/* Browsing is open; customers are asked to add numnum to their home screen after ordering. */}
      <div className="lg:ps-64">{children}</div>
      <DesktopSidebar categories={categories} locationLabel={loc?.label ?? null} />
      <BottomNav />
      <ReviewPrompt />
    </LoginGateProvider>
  );
}
