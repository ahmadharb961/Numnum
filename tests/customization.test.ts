import { describe, expect, it } from "vitest";
import { validateSelections, type CustomizationGroupDef } from "@/lib/customization";

const groups: CustomizationGroupDef[] = [
  { id: "size", name: "Size", type: "SINGLE", required: true, minSelect: 1, maxSelect: 1, options: [
    { id: "s", name: "Small", priceDeltaCents: -100, available: true },
    { id: "l", name: "Large", priceDeltaCents: 200, available: true },
  ] },
  { id: "extras", name: "Extras", type: "MULTIPLE", required: false, minSelect: 0, maxSelect: 2, options: [
    { id: "cheese", name: "Extra cheese", priceDeltaCents: 100, available: true },
    { id: "bacon", name: "Bacon", priceDeltaCents: 150, available: true },
    { id: "egg", name: "Egg", priceDeltaCents: 80, available: false },
  ] },
  { id: "note", name: "Special instructions", type: "TEXT", required: false, minSelect: 0, maxSelect: 0, options: [] },
];

describe("customization validation", () => {
  it("requires required single choices", () => {
    const r = validateSelections(groups, {});
    expect(r.ok).toBe(false);
    expect(r.errors.size).toMatch(/Size/);
  });
  it("sums option prices including negatives", () => {
    const r = validateSelections(groups, { size: ["s"], extras: ["cheese", "bacon"] });
    expect(r.ok).toBe(true);
    expect(r.unitOptionsCents).toBe(150);
  });
  it("enforces max selections", () => {
    const r = validateSelections(groups, { size: ["l"], extras: ["cheese", "bacon", "egg"] });
    expect(r.ok).toBe(false);
  });
  it("rejects unavailable or foreign options", () => {
    expect(validateSelections(groups, { size: ["l"], extras: ["egg"] }).ok).toBe(false);
    expect(validateSelections(groups, { size: ["xl"] }).ok).toBe(false);
    expect(validateSelections(groups, { size: ["l"], hacked: ["x"] }).ok).toBe(false);
  });
  it("captures free text", () => {
    const r = validateSelections(groups, { size: ["l"], note: "  no onions " });
    expect(r.chosen.find((c) => c.groupId === "note")?.optionName).toBe("no onions");
  });
});
