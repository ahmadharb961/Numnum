// Fallback place names for Lebanon when online reverse geocoding is unavailable.
import { distanceKm } from "./geo";

// city is empty for places that are themselves the city.
type Place = [name: string, city: string, lat: number, lng: number];

const PLACES: Place[] = [
  ["Hamra", "Beirut", 33.8966, 35.4823],
  ["Ras Beirut", "Beirut", 33.9005, 35.4785],
  ["Verdun", "Beirut", 33.8866, 35.4857],
  ["Achrafieh", "Beirut", 33.8869, 35.5197],
  ["Gemmayzeh", "Beirut", 33.8946, 35.5165],
  ["Mar Mikhael", "Beirut", 33.8975, 35.5265],
  ["Downtown", "Beirut", 33.8959, 35.5047],
  ["Badaro", "Beirut", 33.8745, 35.5145],
  ["Mazraa", "Beirut", 33.8780, 35.4960],
  ["Ain El Mreisseh", "Beirut", 33.9010, 35.4940],
  ["Sin El Fil", "Metn", 33.8710, 35.5380],
  ["Dekwaneh", "Metn", 33.8790, 35.5450],
  ["Jdeideh", "Metn", 33.8930, 35.5600],
  ["Dbayeh", "Metn", 33.9420, 35.5900],
  ["Jal El Dib", "Metn", 33.9120, 35.5800],
  ["Antelias", "Metn", 33.9150, 35.5850],
  ["Hazmieh", "Baabda", 33.8580, 35.5370],
  ["Baabda", "Baabda", 33.8338, 35.5442],
  ["Hadath", "Baabda", 33.8380, 35.5200],
  ["Jounieh", "Keserwan", 33.9808, 35.6178],
  ["Kaslik", "Keserwan", 33.9750, 35.6100],
  ["Byblos", "Jbeil", 34.1230, 35.6519],
  ["Batroun", "", 34.2553, 35.6581],
  ["Tripoli", "", 34.4367, 35.8497],
  ["Saida", "", 33.5571, 35.3729],
  ["Tyre", "", 33.2705, 35.2038],
  ["Zahle", "Bekaa", 33.8463, 35.9020],
  ["Aley", "Mount Lebanon", 33.8100, 35.6000],
  ["Broummana", "Metn", 33.8810, 35.6200],
];

/** "Hamra, Beirut, Lebanon" for the nearest known area within 4 km, else null. */
export function nearestPlaceName(lat: number, lng: number): string | null {
  let best: { p: Place; km: number } | null = null;
  for (const p of PLACES) {
    const km = distanceKm({ lat, lng }, { lat: p[2], lng: p[3] });
    if (!best || km < best.km) best = { p, km };
  }
  return best && best.km <= 4 ? [best.p[0], best.p[1], "Lebanon"].filter(Boolean).join(", ") : null;
}
