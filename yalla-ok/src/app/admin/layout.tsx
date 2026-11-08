import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Yalla Ok" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireAdmin();
  const [{ count: payments }, { count: approvals }, { count: reports }] = await Promise.all([
    supabase.from("payment_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("task_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  return (
    <div className="space-y-6">
      <AdminNav badges={{ payments: payments ?? 0, tasks: approvals ?? 0, reports: reports ?? 0 }} />
      <div>{children}</div>
    </div>
  );
}
