import type { Metadata } from "next";
import { BadgeCheck, Bell, Clapperboard, Heart, Megaphone, Receipt, Tag, UserPlus, XCircle } from "lucide-react";
import Link from "@/components/link";
import { requireUser } from "@/server/auth";
import { userNotifications } from "@/server/user-notifications";
import { PageHeader } from "@/components/customer/page-header";
import { MarkNotificationsSeen } from "@/components/mark-seen";
import { EmptyState } from "@/components/ui/misc";
import { showText } from "@/lib/notification-text";
import { cn, formatDateTime } from "@/lib/utils";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Notifications"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

// The icon and colour for each kind of notification.
function look(type: string) {
  if (type === "creator_new_follower") return { icon: UserPlus, tone: "bg-pink-50 text-pink-500" };
  if (type === "creator_approved" || type === "creator_restored" || type === "creator_tag_accepted" || type === "creator_first_order") return { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-600" };
  if (type === "creator_declined" || type === "creator_suspended" || type === "creator_tag_declined" || type === "creator_tag_removed" || type === "creator_tag_expired") return { icon: XCircle, tone: "bg-rose-50 text-rose-600" };
  if (type.startsWith("follow_creator")) return { icon: Clapperboard, tone: "bg-brand-50 text-brand-500" };
  if (type.includes("deal")) return { icon: Tag, tone: "bg-amber-50 text-amber-600" };
  if (type.startsWith("follow_")) return { icon: Heart, tone: "bg-brand-50 text-brand-500" };
  if (type.startsWith("order")) return { icon: Receipt, tone: "bg-sky-50 text-sky-600" };
  if (type === "BROADCAST") return { icon: Megaphone, tone: "bg-violet-50 text-violet-600" };
  return { icon: Bell, tone: "bg-black/5 text-ink-soft" };
}

/** "just now", "5 min", "3 h", "2 d", then the date. */
function when(d: Date, t: (k: string, v?: Record<string, string | number>) => string, lang: string) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return t("just now");
  if (m < 60) return t("{n} min ago", { n: m });
  if (m < 60 * 24) return t("{n} h ago", { n: Math.floor(m / 60) });
  if (m < 60 * 24 * 7) return t("{n} d ago", { n: Math.floor(m / 1440) });
  return formatDateTime(d, lang);
}

export default async function NotificationsPage() {
  const [t, lang] = await Promise.all([getT(), getLocale()]);
  const me = await requireUser("/account/notifications");
  const items = await userNotifications(me.id);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <main className="pb-nav">
      <PageHeader title="Notifications" />
      <MarkNotificationsSeen unread={unread} />
      <div className="container-app max-w-2xl pt-3">
        {items.length ? (
          <ul className="card divide-y divide-black/5 overflow-hidden" data-testid="notifications">
            {items.map((n) => {
              const { icon: Icon, tone } = look(n.type);
              const row = (
                <div className={cn("flex gap-3 p-4", !n.readAt && "bg-brand-50/50")} data-unread={n.readAt ? undefined : ""}>
                  <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", tone)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug">{n.type === "BROADCAST" ? n.title : showText(t, n.title)}</span>
                    {n.body && <span className="mt-0.5 block text-sm text-ink-muted">{n.type === "BROADCAST" ? n.body : showText(t, n.body)}</span>}
                    <span className="mt-1 block text-xs text-ink-muted">{when(n.createdAt, t, lang)}</span>
                  </span>
                  {n.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.imageUrl} alt="" className="h-14 w-11 shrink-0 rounded-lg bg-black/5 object-cover" loading="lazy" />
                  )}
                  {!n.readAt && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" aria-label={t("New")} />}
                </div>
              );
              return (
                <li key={n.id} data-testid="notification">
                  {n.link ? <Link href={n.link}>{row}</Link> : row}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Bell />} title={t("No notifications yet")} body={t("New followers, your reels' approvals and news from who you follow show up here.")} />
        )}
      </div>
    </main>
  );
}
