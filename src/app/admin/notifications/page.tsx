import Link from "next/link";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/misc";
import { markAdminNotificationsReadAction } from "@/actions/admin";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function AdminNotifications() {
  const items = await prisma.notification.findMany({ where: { audience: "ADMIN" }, orderBy: { createdAt: "desc" }, take: 150 });
  return (
    <DashPage title="Notifications" actions={items.some((i) => !i.readAt) && <ActionButton action={markAdminNotificationsReadAction}>Mark all read</ActionButton>}>
      {items.length ? (
        <ul className="card divide-y divide-black/5">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? "#"} className={cn("block p-4", !n.readAt && "bg-brand-50/40")}>
                <div className="text-sm font-semibold">{n.title}</div>
                {n.body && <div className="text-sm text-ink-muted">{n.body}</div>}
                <div className="text-xs text-ink-muted">{formatDateTime(n.createdAt)}</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card">
          <EmptyState title="No notifications" />
        </div>
      )}
    </DashPage>
  );
}
