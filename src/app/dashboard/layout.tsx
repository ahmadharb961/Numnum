import type { Metadata } from "next";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashboardNav } from "@/components/dashboard/nav";
import { Alert } from "@/components/ui/misc";
import Link from "next/link";
import { NewOrderAlert } from "@/components/dashboard/new-order-alert";
import { InstallGate } from "@/components/dashboard/install-gate";
import { getT } from "@/i18n/server";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · numnum for restaurants" },
  robots: { index: false },
  manifest: "/manifest-business.webmanifest",
  appleWebApp: { capable: true, title: "numnum Orders", statusBarStyle: "default" },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const ctx = await requireRestaurant();
  const r = ctx.restaurant;
  const [unread, pendingOrders] = await Promise.all([
    prisma.notification.count({ where: { restaurantId: r.id, audience: "RESTAURANT", readAt: null } }),
    prisma.order.count({ where: { restaurantId: r.id, status: "PLACED" } }),
  ]);
  return (
    <div className="min-h-dvh bg-cream">
      {ctx.asAdmin && (
        <form action="/admin/exit-restaurant" method="post" className="fixed inset-x-0 z-[70] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full bg-ink py-2 pe-2 ps-4 text-sm text-white shadow-lg" style={{ bottom: "calc(var(--safe-bottom) + 16px)" }}>
          <span className="truncate">
            Admin: managing <b>{r.displayName}</b>
          </span>
          <button type="submit" className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25">
            Back to admin
          </button>
        </form>
      )}
      <InstallGate bypass={ctx.asAdmin}>
      <DashboardNav restaurantName={r.displayName} slug={r.slug} role={ctx.staffRole} memberships={ctx.memberships} currentId={r.id} unread={unread} pendingOrders={pendingOrders} />
      <div className="lg:ps-64">
        <div className="flex justify-end px-4 pt-3 lg:px-8">
          <NewOrderAlert initialCount={pendingOrders} />
        </div>
        {r.status === "SUSPENDED" && (
          <div className="px-4 pt-4 lg:px-8">
            <Alert tone="red">
              {r.suspendedReason ? t("Your restaurant is suspended: {reason}.", { reason: r.suspendedReason }) : t("Your restaurant is suspended.")} {t("Your profile is hidden from customers.")} <Link href="/dashboard/billing" className="font-semibold underline">{t("Billing")}</Link>
            </Alert>
          </div>
        )}
        {(r.restrictReels || r.restrictPromotion) && r.status !== "SUSPENDED" && (
          <div className="px-4 pt-4 lg:px-8">
            <Alert tone="amber">{t("Some features are restricted due to an overdue invoice.")} <Link href="/dashboard/billing" className="font-semibold underline">{t("Settle now")}</Link></Alert>
          </div>
        )}
        {children}
      </div>
      </InstallGate>
    </div>
  );
}
