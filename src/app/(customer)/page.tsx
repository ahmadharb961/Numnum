import type { Viewport } from "next";
import { firstReelBootScript, warmUpFirstReel } from "@/lib/reel-warmup";
import { getCurrentUser } from "@/server/auth";
import { ReelFeed } from "@/components/customer/reel-feed";
import { getFeed } from "@/server/feed";
import { likedAndSaved } from "@/server/engagement";
import { getSettings } from "@/server/settings";
import { customerLocation } from "@/server/location";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
// Black status bar above the full-screen video feed.
export const viewport: Viewport = { themeColor: "#000000" };

export default async function HomePage() {
  // Independent lookups together (settings are cached per request, so getFeed reuses them).
  const [t, loc, me, settings] = await Promise.all([getT(), customerLocation(), getCurrentUser(), getSettings()]);
  const feed = await getFeed({ cursor: 0, limit: 6, location: loc, viewerId: me?.id });
  warmUpFirstReel(feed.reels[0]);
  const { liked, saved } = await likedAndSaved(feed.reels.map((r) => r.id));
  return (
    <main>
      <h1 className="sr-only">{t("numnum — food reels from Lebanese restaurants")}</h1>
      {/* Starts the first reel before the app loads; the feed adopts this video. */}
      {(() => {
        const boot = firstReelBootScript(feed.reels[0], 0);
        return <script dangerouslySetInnerHTML={{ __html: boot }} />;
      })()}
      <ReelFeed locationLabel={loc?.label ?? null} initial={feed.reels.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id) }))} initialCursor={feed.nextCursor} minViewMs={settings.minViewMs} />
    </main>
  );
}
