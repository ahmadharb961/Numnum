import { parseSearchParams, restaurantsDeliveringTo } from "@/server/search";
import { exploreSearch } from "@/server/explore-search";
import { customerLocation } from "@/server/location";
import { errorResponse, json, limit } from "@/server/http";

/** Explore search (one tab, one page) for as-you-type results. */
export async function GET(req: Request) {
  try {
    await limit("search", 600, 60_000);
    const p = parseSearchParams(Object.fromEntries(new URL(req.url).searchParams));
    const loc = await customerLocation();
    if (p.delivery && loc) p.nearIds = await restaurantsDeliveringTo(loc);
    return json(await exploreSearch(p, loc ? { lat: loc.lat, lng: loc.lng } : null));
  } catch (e) {
    return errorResponse(e);
  }
}
