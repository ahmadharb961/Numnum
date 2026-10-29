import Link from "next/link";
import { prisma } from "@/server/db";
import { DashPage, Section } from "@/components/dashboard/page";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, EmptyState, Stars } from "@/components/ui/misc";
import { moderateReelAction, moderateReviewAction, resolveReportAction } from "@/actions/admin";
import { cn, compactNumber, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Moderation" };

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab ?? "reports";
  const tabs = [
    ["reports", "Reports"],
    ["reels", "Reels"],
    ["reviews", "Reviews"],
    ["images", "Recent images"],
  ];
  return (
    <DashPage title="Content moderation">
      <div className="mb-4 flex gap-2">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/admin/moderation?tab=${k}`} className={cn("chip h-9 text-xs", tab === k && "chip-active")}>
            {l}
          </Link>
        ))}
      </div>
      {tab === "reports" && <Reports />}
      {tab === "reels" && <Reels />}
      {tab === "reviews" && <Reviews />}
      {tab === "images" && <Images />}
    </DashPage>
  );
}

async function Reports() {
  const reports = await prisma.report.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 100 });
  if (!reports.length) return <div className="card"><EmptyState title="No open reports" /></div>;
  const reelIds = reports.filter((r) => r.targetType === "REEL").map((r) => r.targetId);
  const itemRevIds = reports.filter((r) => r.targetType === "ITEM_REVIEW").map((r) => r.targetId);
  const restRevIds = reports.filter((r) => r.targetType === "RESTAURANT_REVIEW").map((r) => r.targetId);
  const [reels, itemRevs, restRevs] = await Promise.all([
    prisma.reel.findMany({ where: { id: { in: reelIds } }, include: { restaurant: { select: { displayName: true } } } }),
    prisma.itemReview.findMany({ where: { id: { in: itemRevIds } } }),
    prisma.restaurantReview.findMany({ where: { id: { in: restRevIds } } }),
  ]);
  return (
    <ul className="space-y-3">
      {reports.map((r) => {
        const reel = reels.find((x) => x.id === r.targetId);
        const rev = itemRevs.find((x) => x.id === r.targetId) ?? restRevs.find((x) => x.id === r.targetId);
        return (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="red">{r.reason}</Badge>
                <span className="text-sm font-semibold">{r.targetType.replace("_", " ").toLowerCase()}</span>
                {r.reporterRestaurantId && <Badge>reported by restaurant</Badge>}
              </div>
              <span className="text-xs text-ink-muted">{formatDateTime(r.createdAt)}</span>
            </div>
            {r.details && <p className="mt-1 text-sm text-ink-muted">“{r.details}”</p>}
            {reel && (
              <div className="mt-2 flex items-center gap-3 text-sm">
                {reel.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reel.posterUrl} alt="" className="h-20 w-12 rounded object-cover" />
                )}
                <div>
                  {reel.restaurant.displayName} · {reel.visibility.toLowerCase()}
                  {reel.videoUrl && (
                    <a href={reel.videoUrl} target="_blank" rel="noopener" className="ml-2 font-semibold text-brand-600">
                      Watch
                    </a>
                  )}
                </div>
              </div>
            )}
            {rev && (
              <div className="mt-2 rounded-xl bg-cream p-3 text-sm">
                <Stars value={rev.rating} /> {rev.body} <Badge>{rev.status.toLowerCase()}</Badge>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {reel && reel.visibility !== "REMOVED" && (
                <ActionButton variant="danger" action={moderateReelAction.bind(null, reel.id, "REMOVE")} prompt="Removal reason (shown to restaurant)">
                  Remove reel
                </ActionButton>
              )}
              {rev && rev.status === "VISIBLE" && (
                <ActionButton variant="danger" action={moderateReviewAction.bind(null, r.targetType === "ITEM_REVIEW" ? "item" : "restaurant", rev.id, "HIDDEN")} prompt="Reason for hiding">
                  Hide review
                </ActionButton>
              )}
              <ActionButton action={resolveReportAction.bind(null, r.id, "ACTIONED")} prompt="Resolution note">
                Mark actioned
              </ActionButton>
              <ActionButton variant="ghost" action={resolveReportAction.bind(null, r.id, "DISMISSED")} prompt="Why dismiss?">
                Dismiss
              </ActionButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function Reels() {
  const reels = await prisma.reel.findMany({ where: { visibility: { in: ["PUBLISHED", "REMOVED"] } }, orderBy: { createdAt: "desc" }, take: 60, include: { restaurant: { select: { displayName: true } }, menuItem: { select: { name: true } } } });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {reels.map((r) => (
        <div key={r.id} className="card overflow-hidden">
          <div className="relative aspect-[9/16] bg-black">
            {r.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.posterUrl} alt="" className="h-full w-full object-cover" />
            )}
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              {r.visibility === "REMOVED" && <Badge tone="red">removed</Badge>}
              {r.featured && <Badge tone="brand">featured</Badge>}
              {r.sponsored && <Badge tone="purple">sponsored</Badge>}
            </div>
          </div>
          <div className="space-y-1.5 p-2 text-xs">
            <div className="truncate font-semibold">{r.menuItem.name}</div>
            <div className="truncate text-ink-muted">
              {r.restaurant.displayName} · {compactNumber(r.viewCount)} views
            </div>
            <div className="flex flex-wrap gap-1">
              {r.visibility === "REMOVED" ? (
                <ActionButton action={moderateReelAction.bind(null, r.id, "RESTORE")}>Restore</ActionButton>
              ) : (
                <>
                  <ActionButton action={moderateReelAction.bind(null, r.id, r.featured ? "UNFEATURE" : "FEATURE")}>{r.featured ? "Unfeature" : "Feature"}</ActionButton>
                  <ActionButton action={moderateReelAction.bind(null, r.id, r.sponsored ? "UNSPONSOR" : "SPONSOR")}>{r.sponsored ? "Unsponsor" : "Sponsor"}</ActionButton>
                  <ActionButton variant="danger" action={moderateReelAction.bind(null, r.id, "REMOVE")} prompt="Removal reason">
                    Remove
                  </ActionButton>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function Reviews() {
  const [items, rests] = await Promise.all([
    prisma.itemReview.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { name: true, email: true } }, menuItem: { select: { name: true } }, restaurant: { select: { displayName: true } } } }),
    prisma.restaurantReview.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { name: true, email: true } }, restaurant: { select: { displayName: true } } } }),
  ]);
  const all = [...items.map((r) => ({ ...r, kind: "item" as const, subject: `${r.menuItem.name} · ${r.restaurant.displayName}` })), ...rests.map((r) => ({ ...r, kind: "restaurant" as const, subject: r.restaurant.displayName }))].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return (
    <Section title="Latest reviews">
      <ul className="divide-y divide-black/5">
        {all.map((r) => (
          <li key={r.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                <b>{r.subject}</b>
                <Badge>{r.kind}</Badge>
                <Badge tone={r.status === "VISIBLE" ? "green" : "red"}>{r.status.toLowerCase()}</Badge>
                {r.evidence !== "UNVERIFIED" && <Badge tone="blue">{r.evidence.toLowerCase().replace("_", " ")}</Badge>}
              </div>
              <span className="text-xs text-ink-muted">
                {r.user.name} ({r.user.email}) · {formatDateTime(r.createdAt)}
              </span>
            </div>
            {r.body && <p className="mt-1">{r.body}</p>}
            <div className="mt-2 flex gap-2">
              {r.status !== "VISIBLE" && <ActionButton action={moderateReviewAction.bind(null, r.kind, r.id, "VISIBLE")} prompt="Reason for restoring">Restore</ActionButton>}
              {r.status === "VISIBLE" && <ActionButton action={moderateReviewAction.bind(null, r.kind, r.id, "HIDDEN")} prompt="Reason for hiding">Hide</ActionButton>}
              {r.status !== "REMOVED" && (
                <ActionButton variant="danger" action={moderateReviewAction.bind(null, r.kind, r.id, "REMOVED")} prompt="Reason for removal">
                  Remove
                </ActionButton>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

async function Images() {
  const imgs = await prisma.mediaAsset.findMany({ where: { kind: "IMAGE", isPrivate: false }, orderBy: { createdAt: "desc" }, take: 80, include: { restaurant: { select: { id: true, displayName: true } } } });
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {imgs.map((i) => (
        <a key={i.id} href={i.url} target="_blank" rel="noopener" className="group relative block aspect-square overflow-hidden rounded-lg bg-black/5" title={i.restaurant?.displayName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.thumbUrl ?? i.url} alt="" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px] text-white">{i.restaurant?.displayName}</span>
        </a>
      ))}
    </div>
  );
}
