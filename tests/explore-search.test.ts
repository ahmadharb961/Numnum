import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { exploreSearch } from "@/server/explore-search";
import { refreshAllSearchText, refreshSearchText } from "@/server/search-text";
import { makeRestaurant, resetDb } from "./helpers";

const search = (q: string, extra: Record<string, unknown> = {}) => exploreSearch({ q, page: 1, ...extra, ...({ _: Math.random() } as object) }, null);
const names = (r: Awaited<ReturnType<typeof search>>) => (r.dishes ?? []).map((d) => d.name);

beforeEach(async () => {
  await resetDb();
  const f = await makeRestaurant({ name: "Shawarma Station" });
  const pizza = await prisma.foodCategory.create({ data: { slug: "pizza", name: "Pizza", nameAr: "بيتزا" } });
  await prisma.menuItem.createMany({
    data: [
      { restaurantId: f.restaurant.id, sku: "SH1", name: "Chicken Shawarma Sandwich", description: "Garlic toum and pickles", priceCents: 450, currency: "USD" },
      { restaurantId: f.restaurant.id, sku: "MN1", name: "Zaatar Manousheh", priceCents: 150, currency: "USD" },
      { restaurantId: f.restaurant.id, sku: "PZ1", name: "Margherita", priceCents: 900, currency: "USD", foodCategoryId: pizza.id },
      { restaurantId: f.restaurant.id, sku: "DS1", name: "Tiramisu", description: "Our pizza chef's dessert", priceCents: 600, currency: "USD" },
    ],
  });
  await refreshAllSearchText();
});

describe("explore search (database)", () => {
  it("finds dishes however they're spelled, in Arabic and Arabizi", async () => {
    for (const q of ["shawarma", "shawerma", "chawarma", "شاورما", "manoushe", "man2oushe", "za3tar", "pizzas"]) {
      const r = await search(q);
      expect(r.counts.dishes, q).toBeGreaterThan(0);
    }
    expect(names(await search("shawerma"))[0]).toBe("Chicken Shawarma Sandwich");
  });

  it("puts the dish named after the search first", async () => {
    const r = await search("pizza");
    expect(names(r)).toEqual(["Margherita", "Tiramisu"]); // category match before a description mention
  });

  it("corrects typos only when nothing matches exactly", async () => {
    const r = await search("shawrma");
    expect(r.corrected).toBe(true);
    expect(names(r)).toContain("Chicken Shawarma Sandwich");
    expect((await search("shawarma")).corrected).toBe(false);
    expect((await search("zzqx")).counts).toEqual({ dishes: 0, reels: 0, restaurants: 0 });
  });

  it("searches restaurants by name and by what they serve", async () => {
    expect((await search("station", { type: "restaurants" })).restaurants?.map((r) => r.displayName)).toEqual(["Shawarma Station"]);
    expect((await search("tiramisu", { type: "restaurants" })).counts.restaurants).toBe(1);
  });

  it("applies filters in the database", async () => {
    expect(names(await search("", { category: "pizza" }))).toEqual(["Margherita"]);
    expect(names(await search("", { maxPrice: 2 }))).toEqual(["Zaatar Manousheh"]);
  });

  it("keeps the index up to date when a dish or restaurant is renamed", async () => {
    const item = await prisma.menuItem.findFirstOrThrow({ where: { sku: "MN1" } });
    await prisma.menuItem.update({ where: { id: item.id }, data: { name: "Halloumi Wrap" } });
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } })).searchedAt).toBeNull();
    await refreshSearchText();
    expect(names(await search("halloumi"))).toEqual(["Halloumi Wrap"]);

    const r = await prisma.restaurant.findFirstOrThrow({ where: { displayName: "Shawarma Station" } });
    await prisma.restaurant.update({ where: { id: r.id }, data: { displayName: "Beit Saj" } });
    await refreshSearchText();
    expect((await search("beit saj", { type: "restaurants" })).counts.restaurants).toBe(1);
    expect((await search("beit saj")).counts.dishes).toBeGreaterThan(0);
  });
});
