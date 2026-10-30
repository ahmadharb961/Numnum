import type { Viewport } from "next";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReelFeed } from "@/components/customer/reel-feed";
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
  if (!reel) return { title: "Reel not found" };
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
  const loc = await customerLocation();
  const [feed, settings] = await Promise.all([getFeed({ cursor: 0, limit: 5, excludeIds: [id], location: loc }), getSettings()]);
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
      <ReelFeed locationLabel={loc?.label ?? null} initial={all.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id) }))} initialCursor={feed.nextCursor} excludeIds={[id]} minViewMs={settings.minViewMs} />
    </main>
  );
}
