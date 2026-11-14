import type { Viewport } from "next";
import { BlockedNotice } from "@/components/customer/blocked-notice";
import { restaurantBlockFor } from "@/server/blocks";
import { getCurrentUser } from "@/server/auth";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReelFeed } from "@/components/customer/reel-feed";
import { firstReelBootScript, warmUpFirstReel } from "@/lib/reel-warmup";
import { prisma } from "@/server/db";
import { getFeed, publicReelWhere, reelCardSelect, toPublicReel } from "@/server/feed";
import { likedAndSaved } from "@/server/engagement";
import { getSettings } from "@/server/settings";
import { customerLocation } from "@/server/location";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
// Black status bar above the full-screen video feed.
export const viewport: Viewport = { themeColor: "#000000" };

async function load(id: string) {
  const r = await prisma.reel.findFirst({ where: { ...publicReelWhere, id }, select: reelCardSelect });
  return r ? toPublicReel(r) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const reel = await load((await params).id);
  if (!reel) return { title: (await getT())("Reel not found") };
  const title = `${reel.item.name} · ${reel.restaurant.name}`;
  const description = `${formatMoney(reel.item.priceCents, reel.item.currency)} — ${reel.caption || reel.item.description || "Watch and order on numnum"}`;
  return {
    title,
    description,
    alternates: { canonical: `/reel/${reel.id}` },
    openGraph: { title, description, type: "video.other", images: reel.posterUrl ? [{ url: reel.posterUrl }] : undefined, videos: reel.videoUrl ? [{ url: reel.videoUrl }] : undefined },
  };
}

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const reel = await load(id);
  if (!reel) notFound();
  warmUpFirstReel(reel);
  const blocked = await restaurantBlockFor(reel.restaurant.id);
  if (blocked) return <BlockedNotice blockId={blocked.id} name={reel.restaurant.name} />;
  const loc = await customerLocation();
  const [feed, settings] = await Promise.all([getFeed({ cursor: 0, limit: 5, excludeIds: [id], location: loc, viewerId: (await getCurrentUser())?.id }), getSettings()]);
  const all = [reel, ...feed.reels];
  const { liked, saved } = await likedAndSaved(all.map((r) => r.id));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${reel.item.name} at ${reel.restaurant.name}`,
    description: reel.caption || reel.item.description || reel.item.name,
    thumbnailUrl: reel.posterUrl ? [reel.posterUrl] : undefined,
    contentUrl: reel.videoUrl ?? undefined,
    uploadDate: new Date().toISOString(),
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="sr-only">
        {reel.item.name} at {reel.restaurant.name}
      </h1>
      {/* Starts the first reel before the app loads; the feed adopts this video. */}
      {(() => {
        const boot = firstReelBootScript(reel, 0);
        return boot ? <script dangerouslySetInnerHTML={{ __html: boot }} /> : null;
      })()}
      <ReelFeed locationLabel={loc?.label ?? null} initial={all.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id) }))} initialCursor={feed.nextCursor} excludeIds={[id]} minViewMs={settings.minViewMs} />
    </main>
  );
}
