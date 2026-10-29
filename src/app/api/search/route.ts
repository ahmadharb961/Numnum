import { parseSearchParams, searchDishes, searchReels, searchRestaurants } from "@/server/search";
import { errorResponse, json, limit } from "@/server/http";

export async function GET(req: Request) {
  try {
    await limit("search", 120, 60_000);
    const p = parseSearchParams(Object.fromEntries(new URL(req.url).searchParams));
    if (p.type === "reels") return json({ reels: await searchReels(p) });
    if (p.type === "restaurants") return json({ restaurants: await searchRestaurants(p) });
    return json(await searchDishes(p));
  } catch (e) {
    return errorResponse(e);
  }
}
