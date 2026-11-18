import type { Metadata } from "next";
import Link from "@/components/link";
import { redirect } from "next/navigation";
import { BadgeCheck, BarChart3, ChevronRight, ExternalLink, Pencil, Plus, Store, UserRound } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { syncStreamReels } from "@/server/stream";
import { PIN_MAX, TAG_DAYS } from "@/server/creators";
import { PageHeader } from "@/components/customer/page-header";
import { NotificationsBell } from "@/components/notifications-bell";
import { unreadUserCount } from "@/server/user-notifications";
import { StudioReels, VerificationRequest, type StudioReel } from "@/components/creator/studio-reels";
import { Alert } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { compactNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Creator studio"), robots: { index: false } };
}

export default async function CreatorStudioPage() {
  const t = await getT();
  const me = await requireUser("/creator");
  const c = await prisma.creator.findUnique({ where: { userId: me.id } });
  if (!c || c.status === "PENDING" || c.status === "DECLINED") redirect("/creator/apply");
  // Videos still processing on Cloudflare move on (no webhook needed).
  await syncStreamReels({ creatorId: c.id }).catch(() => 0);
  const unread = await unreadUserCount(me.id);
  const rows = await prisma.reel.findMany({
    where: { creatorId: c.id },
    orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, posterUrl: true, status: true, tagStatus: true, tagNote: true, tagRequestedAt: true, visibility: true, pinnedAt: true, viewCount: true, likeCount: true, orderInits: true, paidPartnership: true, menuItem: { select: { name: true } }, restaurant: { select: { displayName: true } } },
  });
  const reels: StudioReel[] = rows.map((r) => ({
    id: r.id,
    posterUrl: r.posterUrl,
    dish: r.menuItem.name,
    restaurant: r.restaurant.displayName,
    status: r.status,
    tagStatus: r.tagStatus ?? "PENDING",
    tagNote: r.tagNote,
    live: r.tagStatus === "ACCEPTED" && r.visibility === "PUBLISHED" && r.status === "READY",
    moderated: r.visibility === "REMOVED",
    pinned: !!r.pinnedAt,
    views: r.viewCount,
    likes: r.likeCount,
    orders: r.orderInits,
    paidPartnership: r.paidPartnership,
    daysLeft: r.tagStatus === "PENDING" && r.tagRequestedAt ? Math.max(1, Math.ceil((r.tagRequestedAt.getTime() + TAG_DAYS * 86400_000 - Date.now()) / 86400_000)) : null,
  }));
  const live = reels.filter((r) => r.live);
  const totals = { views: live.reduce((s, r) => s + r.views, 0), orders: live.reduce((s, r) => s + r.orders, 0) };
  return (
    <div className="pb-nav">
      <PageHeader title="Creator studio" right={<NotificationsBell unread={unread} label={t("Notifications")} className="hover:bg-black/5" />} />
      <div className="container-app max-w-2xl space-y-5 py-5">
        {c.status === "SUSPENDED" && (
          <Alert tone="red">
            {t("Your creator account is suspended: your reels are hidden.")} {c.decisionNote ? t("Reason: {reason}", { reason: c.decisionNote }) : ""}
          </Alert>
        )}
        <section className="card p-5">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
              {c.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-7 w-7" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-lg font-black">
                <span className="truncate">{c.displayName}</span>
                {c.verification === "APPROVED" && <BadgeCheck className="h-5 w-5 shrink-0 text-sky-500" aria-label={t("Verified")} />}
              </div>
              <div className="text-sm text-ink-muted" dir="ltr">
                @{c.handle}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Link prefetch href="/creator/followers" className="rounded-2xl bg-cream py-3 transition active:scale-95" data-testid="studio-followers">
              <div className="text-2xl font-black tabular">{compactNumber(c.followerCount)}</div>
              <div className="text-xs font-semibold text-brand-600">{t("followers")} ›</div>
            </Link>
            {[
              [compactNumber(totals.views), t("views")],
              [compactNumber(totals.orders), t("orders")],
            ].map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-cream py-3">
                <div className="text-2xl font-black tabular">{n}</div>
                <div className="text-xs text-ink-muted">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Link prefetch href={`/c/${c.handle}`} className={buttonClass("outline", "sm")}>
              <ExternalLink className="h-4 w-4" /> {t("Profile")}
            </Link>
            <Link prefetch href="/creator/profile" className={buttonClass("outline", "sm")}>
              <Pencil className="h-4 w-4" /> {t("Edit")}
            </Link>
            <Link prefetch href="/creator/insights" className={buttonClass("outline", "sm")} data-testid="creator-insights-link">
              <BarChart3 className="h-4 w-4" /> {t("Insights")}
            </Link>
          </div>
        </section>
        {c.status === "APPROVED" && (
          <Link prefetch href="/creator/new" className={buttonClass("primary", "lg") + " w-full"} data-testid="new-reel">
            <Plus className="h-5 w-5" /> {t("Post a reel")}
          </Link>
        )}
        <Link prefetch href="/creator/restaurants" className="card flex items-center gap-3 p-4" data-testid="shoot-restaurants-link">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500">
            <Store className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{t("Restaurants to shoot")}</span>
            <span className="block text-xs text-ink-muted">{t("The restaurants on numnum you can film and tag")}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-ink-muted rtl:-scale-x-100" />
        </Link>
        {c.status === "APPROVED" && <VerificationRequest state={c.verification} />}
        <StudioReels reels={reels} pinMax={PIN_MAX} />
      </div>
    </div>
  );
}
