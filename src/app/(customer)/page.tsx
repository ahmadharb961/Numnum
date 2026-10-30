import { ReelFeed } from "@/components/customer/reel-feed";
import { getFeed } from "@/server/feed";
import { likedAndSaved } from "@/server/engagement";
import { getSettings } from "@/server/settings";
import { customerLocation } from "@/server/location";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const loc = await customerLocation();
  const [feed, settings] = await Promise.all([getFeed({ cursor: 0, limit: 6, location: loc }), getSettings()]);
  const { liked, saved } = await likedAndSaved(feed.reels.map((r) => r.id));
  return (
    <main>
      <h1 className="sr-only">numnum — food reels from Lebanese restaurants</h1>
      <ReelFeed locationLabel={loc?.label ?? null} initial={feed.reels.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id) }))} initialCursor={feed.nextCursor} minViewMs={settings.minViewMs} />
    </main>
  );
}
