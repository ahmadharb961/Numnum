import { isValidLatLng } from "@/lib/geo";
import { nearestPlaceName } from "@/lib/places";

export const runtime = "nodejs";

// Place names barely change: cache by ~100 m cell to stay well within OpenStreetMap's usage policy.
const cache = new Map<string, { name: string | null; at: number }>();
const TTL = 30 * 86400_000;

type NominatimAddress = Record<string, string | undefined>;

function compose(a: NominatimAddress): string | null {
  const local = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.village || a.hamlet;
  const city = a.city || a.town || a.municipality || a.county || a.state_district;
  const parts = [local, city, a.country].filter((p): p is string => !!p);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(", ") : null;
}

async function lookup(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": `numnum/1.0 (${process.env.APP_URL || "https://numnum.me"})`, "Accept-Language": "en" },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const name = compose(((await res.json()) as { address?: NominatimAddress }).address ?? {});
      if (name) return name;
    }
  } catch {
    // fall through to the offline list
  }
  return nearestPlaceName(lat, lng);
}

/** GET /api/geo/reverse?lat=&lng= → { name: "Hamra, Beirut, Lebanon" | null } */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!isValidLatLng(lat, lng)) return Response.json({ name: null }, { status: 400 });
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json({ name: hit.name });
  const name = await lookup(lat, lng);
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  cache.set(key, { name, at: Date.now() });
  return Response.json({ name }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
