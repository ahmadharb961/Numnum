import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { attachDeals, publicReelWhere, reelCardSelect, toPublicReel } from "@/server/feed";
import { creatorGridOrder } from "@/server/creators";
import { likedAndSaved } from "@/server/engagement";
import { followedRestaurantIds } from "@/server/follows";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { ReelFeed } from "@/components/customer/reel-feed";
import { firstReelBootScript, warmUpFirstReel } from "@/lib/reel-warmup";

export const dynamic = "force-dynamic";
// Black status bar above the full-screen video feed.
export const viewport: Viewport = { themeColor: "#000000" };

/** Swipe through a creator's reels (from their profile grid), started like the home feed: instant. */
export default async function CreatorReelsViewer({ params }: { params: Promise<{ handle: string; reelId: string }> }) {
  const { handle, reelId } = await params;
  const reels = await prisma.reel.findMany({ where: { ...publicReelWhere, creator: { handle: handle.toLowerCase(), status: "APPROVED" } }, select: reelCardSelect, orderBy: creatorGridOrder });
  const idx = reels.findIndex((r) => r.id === reelId);
  if (idx === -1) notFound();
  const settings = await getSettings();
  const me = await getCurrentUser();
  // Restaurants this viewer blocked are left out.
  const blocked = me ? new Set((await prisma.userBlock.findMany({ where: { userId: me.id, restaurantId: { not: null } }, select: { restaurantId: true } })).map((b) => b.restaurantId)) : new Set<string | null>();
  const visible = reels.filter((r, i) => i === idx || !blocked.has(r.restaurantId));
  const start = visible.findIndex((r) => r.id === reelId);
  const pub = await attachDeals(visible.map((r) => toPublicReel(r)));
  warmUpFirstReel(pub[start]);
  const [{ liked, saved }, followed] = await Promise.all([likedAndSaved(pub.map((r) => r.id)), followedRestaurantIds(me?.id, [...new Set(pub.map((r) => r.restaurant.id))])]);
  return (
    <main>
      {/* Starts the first reel before the app loads; the feed adopts this video. */}
      {(() => {
        const boot = firstReelBootScript(pub[start], start);
        return <script dangerouslySetInnerHTML={{ __html: boot }} />;
      })()}
      <ReelFeed fixed initial={pub.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id), following: followed.has(r.restaurant.id) }))} initialCursor={null} startIndex={start} minViewMs={settings.minViewMs} backHref={`/c/${handle}`} />
    </main>
  );
}
