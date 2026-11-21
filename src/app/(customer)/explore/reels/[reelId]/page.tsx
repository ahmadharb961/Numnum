import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { attachDeals, publicReelWhere, reelCardSelect, toPublicReel } from "@/server/feed";
import { likedAndSaved } from "@/server/engagement";
import { followedRestaurantIds } from "@/server/follows";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getBlocks } from "@/server/blocks";
import { customerLocation } from "@/server/location";
import { parseSearchParams, restaurantsDeliveringTo } from "@/server/search";
import { exploreReelIds } from "@/server/explore-search";
import { ReelFeed } from "@/components/customer/reel-feed";
import { firstReelBootScript, warmUpFirstReel } from "@/lib/reel-warmup";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
// Black status bar above the full-screen video feed.
export const viewport: Viewport = { themeColor: "#000000" };
export const metadata: Metadata = { robots: { index: false } };

// The most results one viewer holds: plenty to swipe through, and quick to load.
const MAX = 100;

/**
 * A reel opened from Explore's Reels results: swiping goes through exactly those results (same
 * search, same filters, same order), and Back returns to them as they were.
 */
export default async function ExploreReelsViewer({ params, searchParams }: { params: Promise<{ reelId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ reelId }, sp] = await Promise.all([params, searchParams]);
  const p = { ...parseSearchParams(sp), type: "reels" as const };
  const [loc, blocks, settings, t] = await Promise.all([customerLocation(), getBlocks(), getSettings(), getT()]);
  if (p.delivery && loc) p.nearIds = await restaurantsDeliveringTo(loc);
  let ids = await exploreReelIds({ ...p, blockedIds: blocks.restaurantIds, lbpPerUsd: settings.lbpPerUsd }, MAX);
  // The reel tapped is always there (e.g. a result past the first 100, or one that just changed).
  if (!ids.includes(reelId)) ids = [reelId, ...ids.slice(0, MAX - 1)];
  const rows = await prisma.reel.findMany({ where: { ...publicReelWhere, id: { in: ids } }, select: reelCardSelect });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  const idx = ordered.findIndex((r) => r.id === reelId);
  if (idx === -1) notFound();
  const pub = await attachDeals(ordered.map((r) => toPublicReel(r)));
  warmUpFirstReel(pub[idx]);
  const me = await getCurrentUser();
  const [{ liked, saved }, followed] = await Promise.all([likedAndSaved(pub.map((r) => r.id)), followedRestaurantIds(me?.id, [...new Set(pub.map((r) => r.restaurant.id))])]);

  // What these results are, e.g. "$3 – $5" or "“burger” · Up to $5".
  const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const price =
    p.minPrice !== undefined && p.maxPrice !== undefined
      ? `${usd(p.minPrice)} – ${usd(p.maxPrice)}`
      : p.minPrice !== undefined
        ? t("From {price}", { price: usd(p.minPrice) })
        : p.maxPrice !== undefined
          ? t("Up to {price}", { price: usd(p.maxPrice) })
          : null;
  const title = [p.q && `“${p.q}”`, price].filter(Boolean).join(" · ") || t("Reels");
  // Back to the same results (the browser's own Back is used when there is one).
  const back = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) back.set(k, v);
  back.set("type", "reels");

  return (
    <main>
      {/* Starts the first reel before the app loads; the feed adopts this video. */}
      {(() => {
        const boot = firstReelBootScript(pub[idx], idx);
        return <script dangerouslySetInnerHTML={{ __html: boot }} />;
      })()}
      <ReelFeed fixed title={title} initial={pub.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id), following: followed.has(r.restaurant.id) }))} initialCursor={null} startIndex={idx} minViewMs={settings.minViewMs} backHref={`/explore?${back.toString()}`} />
    </main>
  );
}
