import "server-only";
import { cookies } from "next/headers";
import { isValidLatLng, type LatLng } from "@/lib/geo";

export const LOCATION_COOKIE = "nn_loc";

/** The delivery location the customer chose (GPS, map pin or saved address), if any. */
export async function customerLocation(): Promise<(LatLng & { label: string }) | null> {
  const raw = (await cookies()).get(LOCATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as { lat: number; lng: number; label?: string };
    return isValidLatLng(v.lat, v.lng) ? { lat: v.lat, lng: v.lng, label: String(v.label ?? "Your location").slice(0, 60) } : null;
  } catch {
    return null;
  }
}
