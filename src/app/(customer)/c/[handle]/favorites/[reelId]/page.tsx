import type { Viewport } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/server/db";
import { attachDeals, publicReelWhere, reelCardSelect, toPublicReel } from "@/server/feed";
import { creatorFavorites, handleRedirect } from "@/server/creators";
import { likedAndSaved } from "@/server/engagement";
import { followedRestaurantIds } from "@/server/follows";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { ReelFeed } from "@/components/customer/reel-feed";
import { firstReelBootScript, warmUpFirstReel } from "@/lib/reel-warmup";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
// Black status bar above the full-screen video feed.
export const viewport: Viewport = { themeColor: "#000000" };

/** Swipe through the reels a creator saved (their Favorites tab); Back returns to that tab. */
export default async function CreatorFavoritesViewer({ params }: { params: Promise<{ handle: string; reelId: string }> }) {
  const { handle, reelId } = await params;
  const c = await prisma.creator.findFirst({ where: { handle: handle.toLowerCase(), status: "APPROVED" }, select: { userId: true, displayName: true, handle: true } });
  if (!c) {
    const moved = await handleRedirect(handle);
    if (moved) permanentRedirect(`/c/${moved}/favorites/${reelId}`);
    notFound();
  }
  const favIds = (await creatorFavorites(c.userId)).map((r) => r.id);
  if (!favIds.includes(reelId)) notFound();
  const me = await getCurrentUser();
  // Restaurants this viewer blocked are left out (except the reel they tapped).
  const blocked = me ? new Set((await prisma.userBlock.findMany({ where: { userId: me.id, restaurantId: { not: null } }, select: { restaurantId: true } })).map((b) => b.restaurantId)) : new Set<string | null>();
  const rows = await prisma.reel.findMany({ where: { ...publicReelWhere, id: { in: favIds } }, select: reelCardSelect });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visible = favIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r && (r.id === reelId || !blocked.has(r.restaurantId)));
  const start = visible.findIndex((r) => r.id === reelId);
  const [settings, t] = await Promise.all([getSettings(), getT()]);
  const pub = await attachDeals(visible.map((r) => toPublicReel(r)));
  warmUpFirstReel(pub[start]);
  const [{ liked, saved }, followed] = await Promise.all([likedAndSaved(pub.map((r) => r.id)), followedRestaurantIds(me?.id, [...new Set(pub.map((r) => r.restaurant.id))])]);
  return (
    <main>
      {(() => {
        const boot = firstReelBootScript(pub[start], start);
        return <script dangerouslySetInnerHTML={{ __html: boot }} />;
      })()}
      <ReelFeed fixed title={t("{name}'s favorites", { name: c.displayName })} initial={pub.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id), following: followed.has(r.restaurant.id) }))} initialCursor={null} startIndex={start} minViewMs={settings.minViewMs} backHref={`/c/${c.handle}#favorites`} />
    </main>
  );
}
