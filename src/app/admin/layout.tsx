import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminNav } from "@/components/admin/nav";
import { I18nProvider } from "@/i18n/client";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · numnum admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [pendingRestaurants, verifications, suspicious, pendingAdjustments, overdue, payments, disputes, reports, notifications] = await Promise.all([
    prisma.restaurant.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.restaurant.count({ where: { verificationStatus: "PENDING" } }),
    prisma.order.count({ where: { suspicious: true } }),
    prisma.commissionAdjustment.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({ where: { status: "OVERDUE" } }),
    prisma.payment.count({ where: { status: "SUBMITTED" } }),
    prisma.commissionDispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.notification.count({ where: { audience: "ADMIN", readAt: null } }),
  ]);
  return (
    // The admin panel stays in English, left to right, whatever language is chosen.
    <div className="min-h-dvh bg-cream" dir="ltr" lang="en">
      <I18nProvider locale="en" dict={null}>
      <AdminNav counts={{ pendingRestaurants, verifications, suspicious, pendingAdjustments, overdue, payments, disputes, reports, notifications }} />
      <div className="lg:pl-60">{children}</div>
      </I18nProvider>
    </div>
  );
}
