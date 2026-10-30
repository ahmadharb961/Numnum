import { getFeed } from "@/server/feed";
import { likedAndSaved } from "@/server/engagement";
import { errorResponse, json, limit } from "@/server/http";
import { customerLocation } from "@/server/location";

export async function GET(req: Request) {
  try {
    await limit("feed", 120, 60_000);
    const url = new URL(req.url);
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") || 0) || 0);
    const exclude = (url.searchParams.get("exclude") || "").split(",").filter(Boolean).slice(0, 20);
    const feed = await getFeed({ cursor, location: await customerLocation(), excludeIds: exclude });
    const { liked, saved } = await likedAndSaved(feed.reels.map((r) => r.id));
    return json({ reels: feed.reels.map((r) => ({ ...r, liked: liked.has(r.id), saved: saved.has(r.id) })), nextCursor: feed.nextCursor });
  } catch (e) {
    return errorResponse(e);
  }
}
