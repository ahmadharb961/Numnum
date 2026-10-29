import Link from "next/link";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { MarkAllRead } from "@/components/dashboard/simple-actions";
import { EmptyState } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireRestaurant();
  const items = await prisma.notification.findMany({ where: { restaurantId: ctx.restaurant.id, audience: "RESTAURANT" }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <DashPage title="Notifications" actions={items.some((i) => !i.readAt) && <MarkAllRead />}>
      {items.length ? (
        <ul className="card divide-y divide-black/5">
          {items.map((n) => {
            const body = (
              <div className={cn("flex gap-3 p-4", !n.readAt && "bg-brand-50/40")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-500")} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{n.title}</div>
                  {n.body && <div className="text-sm text-ink-muted">{n.body}</div>}
                  <div className="mt-0.5 text-xs text-ink-muted">{formatDateTime(n.createdAt)}</div>
                </div>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>;
          })}
        </ul>
      ) : (
        <div className="card">
          <EmptyState title="You're all caught up" />
        </div>
      )}
    </DashPage>
  );
}
