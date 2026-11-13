import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminNav } from "@/components/admin/nav";
import { I18nProvider } from "@/i18n/client";
import { FreshOnNavigate } from "@/components/fresh-on-navigate";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · numnum admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  // The menu badges, all counted in one query (one database round trip on every admin page).
  const [c] = await prisma.$queryRaw<Record<"pendingRestaurants" | "verifications" | "suspicious" | "pendingAdjustments" | "overdue" | "payments" | "disputes" | "reports" | "notifications", number>[]>`
    SELECT
      (SELECT count(*) FROM restaurants WHERE status = 'PENDING_APPROVAL')::int AS "pendingRestaurants",
      (SELECT count(*) FROM restaurants WHERE "verificationStatus" = 'PENDING')::int AS verifications,
      (SELECT count(*) FROM orders WHERE suspicious)::int AS suspicious,
      (SELECT count(*) FROM commission_adjustments WHERE status = 'PENDING')::int AS "pendingAdjustments",
      (SELECT count(*) FROM invoices WHERE status = 'OVERDUE')::int AS overdue,
      (SELECT count(*) FROM payments WHERE status = 'SUBMITTED')::int AS payments,
      (SELECT count(*) FROM commission_disputes WHERE status IN ('OPEN', 'UNDER_REVIEW'))::int AS disputes,
      (SELECT count(*) FROM reports WHERE status = 'OPEN')::int AS reports,
      (SELECT count(*) FROM notifications WHERE audience = 'ADMIN' AND "readAt" IS NULL)::int AS notifications`;
  return (
    // The admin panel stays in English, left to right, whatever language is chosen.
    <div className="min-h-dvh bg-cream" dir="ltr" lang="en">
      <I18nProvider locale="en" dict={null}>
      <AdminNav counts={c} />
      <FreshOnNavigate />
      <div className="lg:pl-60">{children}</div>
      </I18nProvider>
    </div>
  );
}
