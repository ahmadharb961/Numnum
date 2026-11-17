import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, UserRound } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { syncStreamReels } from "@/server/stream";
import { parseRange, restaurantCreatorReelsPerformance } from "@/server/insights";
import { DashPage, Section } from "@/components/dashboard/page";
import { LiveTagRow, PendingTagCard, UnblockButton, type LiveTag, type PendingTag, type TagCreator } from "@/components/dashboard/creator-tags";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Creator reels" };

const creatorSelect = { id: true, handle: true, displayName: true, avatarUrl: true, verification: true, followerCount: true } as const;
const toCreator = (c: { id: string; handle: string; displayName: string; avatarUrl: string | null; verification: string; followerCount: number }): TagCreator => ({ id: c.id, handle: c.handle, name: c.displayName, avatarUrl: c.avatarUrl, verified: c.verification === "APPROVED", followers: c.followerCount });

/** Food creators' reels tagging this restaurant's dishes: review new tags, see what live ones bring. */
export default async function CreatorReelsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const t = await getT();
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const range = parseRange({ days: String(days) });
  await syncStreamReels({ restaurantId: r.id }).catch(() => 0);
  const [pendingRows, liveRows, perf, history, blocked] = await Promise.all([
    prisma.reel.findMany({ where: { restaurantId: r.id, creatorId: { not: null }, tagStatus: "PENDING", status: "READY", creator: { status: "APPROVED" } }, orderBy: { tagRequestedAt: "asc" }, select: { id: true, videoUrl: true, posterUrl: true, caption: true, paidPartnership: true, tagRequestedAt: true, menuItem: { select: { name: true } }, creator: { select: creatorSelect } } }),
    prisma.reel.findMany({ where: { restaurantId: r.id, creatorId: { not: null }, tagStatus: "ACCEPTED" }, orderBy: { publishedAt: "desc" }, select: { id: true, posterUrl: true, paidPartnership: true, likeCount: true, viewCount: true, menuItem: { select: { name: true } }, creator: { select: creatorSelect } } }),
    restaurantCreatorReelsPerformance(r.id, range),
    prisma.reel.findMany({ where: { restaurantId: r.id, creatorId: { not: null }, tagStatus: { in: ["DECLINED", "REMOVED", "EXPIRED"] } }, orderBy: { tagDecidedAt: "desc" }, take: 20, select: { id: true, tagStatus: true, tagDecidedAt: true, menuItem: { select: { name: true } }, creator: { select: { handle: true } } } }),
    prisma.restaurantCreatorBlock.findMany({ where: { restaurantId: r.id }, orderBy: { createdAt: "desc" }, include: { creator: { select: creatorSelect } } }),
  ]);
  const pending: PendingTag[] = pendingRows.map((p) => ({ id: p.id, videoUrl: p.videoUrl, posterUrl: p.posterUrl, caption: p.caption, dish: p.menuItem.name, paidPartnership: p.paidPartnership, creator: toCreator(p.creator!), requestedAt: (p.tagRequestedAt ?? new Date()).toISOString() }));
  const live: LiveTag[] = liveRows.map((l) => {
    const p = perf.find((x) => x.id === l.id);
    return { id: l.id, posterUrl: l.posterUrl, dish: l.menuItem.name, paidPartnership: l.paidPartnership, creator: toCreator(l.creator!), views: p?.views ?? 0, likes: p?.likes ?? 0, orders: p?.orders ?? 0, revenueCents: p?.revenueCents ?? 0 };
  });
  const totals = { views: live.reduce((s, x) => s + x.views, 0), orders: live.reduce((s, x) => s + x.orders, 0), revenue: live.reduce((s, x) => s + x.revenueCents, 0) };
  const label = { DECLINED: "Declined", REMOVED: "Removed", EXPIRED: "Expired" } as Record<string, string>;
  return (
    <DashPage title="Creator reels" description="Food bloggers post reels and tag your dishes. Nothing goes live until you accept it.">
      {!pending.length && !live.length && !history.length ? (
        <div className="card p-8 text-center" data-testid="creator-reels-empty">
          <Clapperboard className="mx-auto h-10 w-10 text-brand-500" />
          <p className="mx-auto mt-3 max-w-sm text-ink-muted">{t("When a food creator tags one of your dishes in a reel, it appears here for you to accept or decline.")}</p>
        </div>
      ) : null}
      {!!pending.length && (
        <Section title={t("Waiting for you ({n})", { n: pending.length })} description={t("Watch each reel. Tags you don't answer within 7 days expire.")}>
          <div className="space-y-4">
            {pending.map((p) => (
              <PendingTagCard key={p.id} tag={p} />
            ))}
          </div>
        </Section>
      )}
      {!!live.length && (
        <Section
          title={t("Live on your dishes")}
          actions={
            <div className="flex gap-1.5">
              {[7, 30, 90].map((d) => (
                <Link key={d} href={`/dashboard/creator-reels?days=${d}`} className={cn("chip h-8 text-xs", days === d && "chip-active")}>
                  {t("{n} days", { n: d })}
                </Link>
              ))}
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            {[
              [totals.views.toLocaleString("en-US"), t("views")],
              [String(totals.orders), t("orders")],
              [formatMoney(totals.revenue, r.currency), t("revenue")],
            ].map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-cream py-3">
                <div className="text-xl font-black tabular">{n}</div>
                <div className="text-xs text-ink-muted">{l}</div>
              </div>
            ))}
          </div>
          <ul className="divide-y divide-black/5">
            {live.map((l) => (
              <LiveTagRow key={l.id} tag={l} currency={r.currency} />
            ))}
          </ul>
        </Section>
      )}
      {!!history.length && (
        <Section title={t("Past tags")}>
          <ul className="divide-y divide-black/5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span dir="ltr">@{h.creator?.handle}</span> · {h.menuItem.name}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">{t(label[h.tagStatus ?? ""] ?? "")}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!!blocked.length && (
        <Section title={t("Blocked creators")}>
          <ul className="divide-y divide-black/5">
            {blocked.map((b) => (
              <li key={b.creatorId} className="flex items-center gap-3 py-2">
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
                  {b.creator.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.creator.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold" dir="ltr">
                  @{b.creator.handle}
                </span>
                <UnblockButton creatorId={b.creatorId} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DashPage>
  );
}
