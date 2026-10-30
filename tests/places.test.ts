import { describe, expect, it } from "vitest";
import { nearestPlaceName } from "@/lib/places";

describe("nearestPlaceName (offline fallback for the location bar)", () => {
  it("names Beirut neighbourhoods with city and country", () => {
    expect(nearestPlaceName(33.8962, 35.4821)).toBe("Hamra, Beirut, Lebanon");
    expect(nearestPlaceName(33.887, 35.5195)).toBe("Achrafieh, Beirut, Lebanon");
  });
  it("doesn't repeat a city that is the place itself", () => {
    expect(nearestPlaceName(34.437, 35.849)).toBe("Tripoli, Lebanon");
  });
  it("returns null far from any known area", () => {
    expect(nearestPlaceName(33.5, 36.3)).toBeNull();
  });
});
