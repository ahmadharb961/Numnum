import { Bell } from "lucide-react";
import Link from "@/components/link";
import { cn } from "@/lib/utils";

/** The bell that opens Account → Notifications, with the number not yet seen. */
export function NotificationsBell({ unread, label, className }: { unread: number; label: string; className?: string }) {
  return (
    <Link href="/account/notifications" className={cn("relative grid h-10 w-10 place-items-center rounded-full", className)} aria-label={label} data-testid="notifications-bell">
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-white ring-2 ring-white" data-testid="notifications-unread">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
