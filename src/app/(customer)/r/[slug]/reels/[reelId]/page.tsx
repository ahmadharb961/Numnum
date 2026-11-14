import type { Viewport } from "next";
import { BlockedNotice } from "@/components/customer/blocked-notice";
import { restaurantBlockFor } from "@/server/blocks";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { publicReelWhere, reelCardSelect, toPublicReel } from "@/server/feed";
import { likedAndSaved } from "@/server/engagement";
import { getSettings } from "@/server/settings";
import { ReelFeed } from "@/components/customer/reel-feed";
import { firstReelBootScript, warmUpFirstReel } from "@/lib/reel-warmup";

export const dynamic = "force-dynamic";
// Black status bar above the full-screen video feed.
export const viewport: Viewport = { themeColor: "#000000" };

export default async function RestaurantReelsViewer({ params }: { params: Promise<{ slug: string; reelId: string }> }) {
  const { slug, reelId } = await params;
  const reels = await prisma.reel.findMany({ where: { ...publicReelWhere, restaurant: { slug, status: "ACTIVE" } }, select: reelCardSelect, orderBy: { publishedAt: "desc" } });
  const idx = reels.findIndex((r) => r.id === reelId);
  if (idx === -1) notFound();
  const blocked = await restaurantBlockFor(reels[idx].restaurantId);
  if (blocked) return <BlockedNotice blockId={blocked.id} name={reels[idx].restaurant.displayName} />;
  const settings = await getSettings();
  const pub = reels.map((r) => toPublicReel(r));
  warmUpFirstReel(pub[idx]);
  const { liked, saved } = await likedAndSaved(pub.map((r) => r.id));
  return (
    <main>
      {/* Starts the first reel before the app loads; the feed adopts this video. */}
      {(() => {
        const boot = firstReelBootScript(pub[idx], idx);
        return <script dangerouslySetInnerHTML={{ __html: boot }} />;
      })()}
      <ReelFeed fixed initial={pub.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id) }))} initialCursor={null} startIndex={idx} minViewMs={settings.minViewMs} backHref={`/r/${slug}`} />
    </main>
  );
}
