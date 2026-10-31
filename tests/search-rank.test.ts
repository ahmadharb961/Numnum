import { describe, expect, it } from "vitest";
import { queryVariants, rankByMatch } from "@/server/search";

describe("search matching", () => {
  it("accepts plurals", () => {
    expect(queryVariants("pizzas")).toEqual(["pizzas", "pizza"]);
    expect(queryVariants("sandwiches")).toEqual(["sandwiches", "sandwich", "sandwiche"]);
    expect(queryVariants("fries")).toContain("frie");
    expect(queryVariants("gas")).toEqual(["gas"]);
  });

  it("puts dishes named after the search first", () => {
    const items = [
      { name: "Tiramisu", description: "Mascarpone", foodCategory: { name: "Desserts" } },
      { name: "Margherita", description: "Tomato", foodCategory: { name: "Pizza" } },
      { name: "Pepperoni Pizza", description: null, foodCategory: null },
    ];
    expect(rankByMatch(items, "pizzas").map((i) => i.name)).toEqual(["Pepperoni Pizza", "Margherita", "Tiramisu"]);
  });
});
