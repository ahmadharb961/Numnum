// Distance-based delivery. Restaurants pin their location and define zones by
// straight-line distance, e.g. [{maxKm: 3, feeCents: 150}, {maxKm: 6, feeCents: 250}].
// The largest maxKm is the delivery radius; anything farther can't be delivered.

export type LatLng = { lat: number; lng: number };
export type DeliveryZone = { maxKm: number; feeCents: number };

export const MAX_ZONE_KM = 50;

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizeZones(raw: unknown): DeliveryZone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((z) => ({ maxKm: Number((z as DeliveryZone).maxKm), feeCents: Math.round(Number((z as DeliveryZone).feeCents)) }))
    .filter((z) => Number.isFinite(z.maxKm) && z.maxKm > 0 && z.maxKm <= MAX_ZONE_KM && Number.isInteger(z.feeCents) && z.feeCents >= 0)
    .sort((a, b) => a.maxKm - b.maxKm);
}

export function deliveryRadiusKm(zones: DeliveryZone[]): number {
  return zones.length ? zones[zones.length - 1].maxKm : 0;
}

export type DeliveryQuote = { deliverable: true; km: number; feeCents: number; maxKm: number } | { deliverable: false; km: number | null; maxKm: number; reason: "out_of_range" | "no_zones" | "no_location" };

/** Fee for delivering from a restaurant to a customer location, or why it isn't possible. */
export function quoteDelivery(restaurant: { latitude: number | null; longitude: number | null; deliveryZones: unknown }, customer: LatLng | null | undefined): DeliveryQuote {
  const zones = normalizeZones(restaurant.deliveryZones);
  const maxKm = deliveryRadiusKm(zones);
  if (!zones.length || restaurant.latitude == null || restaurant.longitude == null) return { deliverable: false, km: null, maxKm, reason: "no_zones" };
  if (!customer) return { deliverable: false, km: null, maxKm, reason: "no_location" };
  const km = distanceKm({ lat: restaurant.latitude, lng: restaurant.longitude }, customer);
  const zone = zones.find((z) => km <= z.maxKm);
  return zone ? { deliverable: true, km, feeCents: zone.feeCents, maxKm } : { deliverable: false, km, maxKm, reason: "out_of_range" };
}

export function formatKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? Number(km.toFixed(1)) : Math.round(km)} km`;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}
