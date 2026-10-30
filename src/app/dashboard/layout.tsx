import type { Metadata } from "next";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashboardNav } from "@/components/dashboard/nav";
import { Alert } from "@/components/ui/misc";
import Link from "next/link";
import { NewOrderAlert } from "@/components/dashboard/new-order-alert";
import { InstallGate } from "@/components/dashboard/install-gate";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · numnum for restaurants" },
  robots: { index: false },
  manifest: "/manifest-business.webmanifest",
  appleWebApp: { capable: true, title: "numnum Orders", statusBarStyle: "default" },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRestaurant();
  const r = ctx.restaurant;
  const [unread, pendingOrders] = await Promise.all([
    prisma.notification.count({ where: { restaurantId: r.id, audience: "RESTAURANT", readAt: null } }),
    prisma.order.count({ where: { restaurantId: r.id, status: "PLACED" } }),
  ]);
  return (
    <div className="min-h-dvh bg-cream">
      <InstallGate>
      <DashboardNav restaurantName={r.displayName} slug={r.slug} role={ctx.staffRole} memberships={ctx.memberships} currentId={r.id} unread={unread} pendingOrders={pendingOrders} />
      <div className="lg:pl-64">
        <div className="flex justify-end px-4 pt-3 lg:px-8">
          <NewOrderAlert initialCount={pendingOrders} />
        </div>
        {r.status === "SUSPENDED" && (
          <div className="px-4 pt-4 lg:px-8">
            <Alert tone="red">
              Your restaurant is suspended{r.suspendedReason ? `: ${r.suspendedReason}` : ""}. Your profile is hidden from customers. <Link href="/dashboard/billing" className="font-semibold underline">Billing</Link>
            </Alert>
          </div>
        )}
        {(r.restrictReels || r.restrictPromotion) && r.status !== "SUSPENDED" && (
          <div className="px-4 pt-4 lg:px-8">
            <Alert tone="amber">Some features are restricted due to an overdue invoice. <Link href="/dashboard/billing" className="font-semibold underline">Settle now</Link></Alert>
          </div>
        )}
        {children}
      </div>
      </InstallGate>
    </div>
  );
}
