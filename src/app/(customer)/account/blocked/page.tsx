import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { listBlocks } from "@/server/blocks";
import { PageHeader } from "@/components/customer/page-header";
import { BlockedList } from "@/components/customer/blocked-list";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blocked", robots: { index: false } };

export default async function BlockedPage() {
  const t = await getT();
  const user = await requireUser("/account/blocked");
  const rows = await listBlocks(user.id);
  return (
    <main className="pb-nav">
      <PageHeader title={t("Blocked")} />
      <div className="container-app max-w-lg pt-4">
        <p className="mb-3 text-sm text-ink-muted">{t("Their reels, dishes, pages or reviews are hidden for you. Unblock to see them again.")}</p>
        <BlockedList rows={rows.map((r) => ({ id: r.id, label: r.label, kind: r.kind }))} />
      </div>
    </main>
  );
}
