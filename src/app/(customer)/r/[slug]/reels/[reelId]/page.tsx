import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { publicReelWhere, reelCardSelect, toPublicReel } from "@/server/feed";
import { likedAndSaved } from "@/server/engagement";
import { getSettings } from "@/server/settings";
import { ReelFeed } from "@/components/customer/reel-feed";

export const dynamic = "force-dynamic";

export default async function RestaurantReelsViewer({ params }: { params: Promise<{ slug: string; reelId: string }> }) {
  const { slug, reelId } = await params;
  const reels = await prisma.reel.findMany({ where: { ...publicReelWhere, restaurant: { slug, status: "ACTIVE" } }, select: reelCardSelect, orderBy: { publishedAt: "desc" } });
  const idx = reels.findIndex((r) => r.id === reelId);
  if (idx === -1) notFound();
  const settings = await getSettings();
  const pub = reels.map((r) => toPublicReel(r));
  const { liked, saved } = await likedAndSaved(pub.map((r) => r.id));
  return (
    <main>
      <ReelFeed fixed initial={pub.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id) }))} initialCursor={null} startIndex={idx} minViewMs={settings.minViewMs} backHref={`/r/${slug}`} />
    </main>
  );
}
