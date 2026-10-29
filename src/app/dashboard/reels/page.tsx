import Link from "next/link";
import { Plus, Eye, Heart, MessageCircle, Film } from "lucide-react";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { compactNumber, formatDate } from "@/lib/utils";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";

export const metadata = { title: "Reels" };

const visTone = { PUBLISHED: "green", DRAFT: "gray", UNPUBLISHED: "amber", REMOVED: "red" } as const;

export default async function ReelsPage() {
  const ctx = await requireRestaurant("MANAGER");
  const reels = await prisma.reel.findMany({ where: { restaurantId: ctx.restaurant.id }, orderBy: { createdAt: "desc" }, include: { menuItem: { select: { name: true } } } });
  const processing = reels.some((r) => r.status === "PROCESSING");
  return (
    <DashPage
      title="Reels"
      description="Every reel is linked to a menu item, so viewers can order it in one tap."
      actions={
        <Link href="/dashboard/reels/new" className={buttonClass("primary", "sm")}>
          <Plus className="h-4 w-4" /> Upload reel
        </Link>
      }
    >
      {processing && <AutoRefresh seconds={6} />}
      {!reels.length ? (
        <div className="card">
          <EmptyState icon={<Film />} title="No reels yet" body="Short vertical videos (5–60 s) of your dishes perform best." action={<Link href="/dashboard/reels/new" className="chip chip-active">Upload your first reel</Link>} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {reels.map((r) => (
            <Link key={r.id} href={`/dashboard/reels/${r.id}`} className="card overflow-hidden">
              <div className="relative aspect-[9/16] bg-black">
                {r.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
                <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                  {r.status !== "READY" ? <Badge tone={r.status === "FAILED" ? "red" : "blue"}>{r.status === "FAILED" ? "Failed" : "Processing…"}</Badge> : <Badge tone={visTone[r.visibility]}>{r.visibility.toLowerCase()}</Badge>}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-2 text-xs font-semibold text-white">
                  <div className="truncate">{r.menuItem.name}</div>
                  <div className="mt-1 flex gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {compactNumber(r.viewCount)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" />
                      {compactNumber(r.likeCount)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {compactNumber(r.orderInits)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="px-2.5 py-2 text-[11px] text-ink-muted">{formatDate(r.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </DashPage>
  );
}
