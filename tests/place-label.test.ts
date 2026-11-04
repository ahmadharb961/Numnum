import { describe, expect, it } from "vitest";
import { placeLabel } from "@/lib/utils";

describe("placeLabel", () => {
  it("joins area and city", () => expect(placeLabel("Hamra", "Beirut")).toBe("Hamra, Beirut"));
  it("doesn't repeat a town whose area and city are the same", () => expect(placeLabel("Jounieh", "Jounieh")).toBe("Jounieh"));
  it("ignores case and spacing differences", () => expect(placeLabel("Jounieh ", "jounieh")).toBe("Jounieh"));
  it("skips a city already in the area", () => expect(placeLabel("Hamra, Beirut", "Beirut")).toBe("Hamra, Beirut"));
  it("skips empty parts", () => expect(placeLabel(null, "", "Tripoli")).toBe("Tripoli"));
  it("keeps the street", () => expect(placeLabel("Bliss street", "Hamra", "Beirut")).toBe("Bliss street, Hamra, Beirut"));
});
