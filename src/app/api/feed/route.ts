import { getFeed } from "@/server/feed";
import { followedRestaurantIds, followingFeed } from "@/server/follows";
import { getBlocks } from "@/server/blocks";
import { getCurrentUser } from "@/server/auth";
import { likedAndSaved } from "@/server/engagement";
import { errorResponse, json, limit } from "@/server/http";
import { customerLocation } from "@/server/location";

export async function GET(req: Request) {
  try {
    await limit("feed", 120, 60_000);
    const url = new URL(req.url);
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") || 0) || 0);
    const exclude = (url.searchParams.get("exclude") || "").split(",").filter(Boolean).slice(0, 20);
    const [location, me] = await Promise.all([customerLocation(), getCurrentUser()]);
    // ?tab=following: newest reels from restaurants the customer follows.
    const following = url.searchParams.get("tab") === "following";
    if (following && !me) return json({ reels: [], nextCursor: null });
    const feed = following ? await followingFeed(me!.id, { cursor, blockedRestaurantIds: (await getBlocks()).restaurantIds }) : await getFeed({ cursor, location, excludeIds: exclude, viewerId: me?.id });
    const [{ liked, saved }, followed] = await Promise.all([likedAndSaved(feed.reels.map((r) => r.id)), followedRestaurantIds(me?.id, feed.reels.map((r) => r.restaurant.id))]);
    return json({ reels: feed.reels.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id), following: followed.has(r.restaurant.id) })), nextCursor: feed.nextCursor });
  } catch (e) {
    return errorResponse(e);
  }
}
