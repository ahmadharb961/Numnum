import { describe, expect, it } from "vitest";
import { norm, parseQuery, scoreFields, words } from "@/lib/search-match";

const match = (q: string, text: string, fuzzy = true) => scoreFields(parseQuery(q), [{ words: words(text), weight: 1 }], fuzzy) > 0;

describe("instant search matching", () => {
  it("normalizes spelling, accents, Arabic and Arabizi", () => {
    expect(norm("Crème Brûlée")).toBe(norm("creme brulee"));
    expect(norm("Za3tar")).toBe(norm("Zaatar"));
    expect(norm("Chawarma")).toBe(norm("Shawarma"));
    expect(norm("مَنْقُوشَة")).toBe(norm("منقوشه"));
  });

  it("finds Lebanese dishes however they're spelled", () => {
    expect(match("shawerma", "Chicken Shawarma Sandwich")).toBe(true);
    expect(match("chawarma", "Chicken Shawarma Sandwich")).toBe(true);
    expect(match("شاورما", "Chicken Shawarma Sandwich")).toBe(true);
    expect(match("manoushe", "Zaatar Manousheh")).toBe(true);
    expect(match("man2oushe", "Zaatar Manousheh")).toBe(true);
    expect(match("manakish", "Cheese Manousheh")).toBe(true);
    expect(match("kunafa", "Knefeh Bi Jibn")).toBe(true);
    expect(match("za3tar", "Zaatar Manousheh")).toBe(true);
  });

  it("tolerates typos, partial words and plurals", () => {
    expect(match("shawrma", "Shawarma")).toBe(true);
    expect(match("piza", "Margherita Pizza")).toBe(true);
    expect(match("pizzas", "Pizza")).toBe(true);
    expect(match("burg", "Double Smash Burger")).toBe(true);
    expect(match("chese burger", "Classic Cheeseburger with cheese")).toBe(true);
  });

  it("only accepts typos in the fuzzy pass", () => {
    expect(match("hamra", "Batata Harra", false)).toBe(false);
    expect(match("hamra", "Batata Harra", true)).toBe(true);
    expect(match("hamra", "Hamra, Beirut", false)).toBe(true);
  });

  it("needs every typed word to match", () => {
    expect(match("chicken pizza", "Chicken Shawarma")).toBe(false);
    expect(match("sushi", "Margherita Pizza")).toBe(false);
  });

  it("scores a dish name above a description mention", () => {
    const q = parseQuery("pizza");
    const named = scoreFields(q, [{ words: words("Pepperoni Pizza"), weight: 10 }, { words: words("Spicy beef"), weight: 2 }]);
    const described = scoreFields(q, [{ words: words("Tiramisu"), weight: 10 }, { words: words("Our pizza oven dessert"), weight: 2 }]);
    expect(named).toBeGreaterThan(described);
  });
});
