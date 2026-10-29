import { prisma } from "@/server/db";

export async function resetDb() {
  const db = (await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`)[0].current_database;
  if (!db.endsWith("_test")) throw new Error(`Refusing to clear non-test database ${db}`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeRestaurant(overrides: Partial<{ name: string; currency: string; rateBps: number | null }> = {}) {
  n++;
  const user = await prisma.user.create({ data: { email: `owner${n}@test.dev`, passwordHash: "x", name: `Owner ${n}`, roles: { create: { role: "RESTAURANT" } } } });
  const r = await prisma.restaurant.create({
    data: {
      slug: `rest-${n}`,
      businessName: overrides.name ?? `Burger House ${n}`,
      displayName: overrides.name ?? `Burger House ${n}`,
      whatsappNumber: "96170123456",
      status: "ACTIVE",
      orderingEnabled: true,
      agreementAcceptedAt: new Date(),
      currency: overrides.currency ?? "USD",
      commissionRateBps: overrides.rateBps ?? null,
      staff: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const burger = await prisma.menuItem.create({ data: { restaurantId: r.id, sku: "BRG001", name: "Double Smash Burger", priceCents: r.currency === "LBP" ? 671250 : 750, currency: r.currency } });
  const fries = await prisma.menuItem.create({ data: { restaurantId: r.id, sku: "SD001", name: "French Fries", priceCents: r.currency === "LBP" ? 268500 : 300, currency: r.currency } });
  const extras = await prisma.customizationGroup.create({
    data: { restaurantId: r.id, name: "Extras", type: "MULTIPLE", maxSelect: 3, options: { create: [{ name: "Extra cheese", priceDeltaCents: r.currency === "LBP" ? 89500 : 100 }, { name: "Bacon", priceDeltaCents: 150 }] } },
    include: { options: true },
  });
  const sauce = await prisma.customizationGroup.create({
    data: { restaurantId: r.id, name: "Sauce", type: "SINGLE", required: true, options: { create: [{ name: "BBQ sauce" }, { name: "House sauce" }] } },
    include: { options: true },
  });
  await prisma.menuItemCustomizationGroup.createMany({ data: [{ menuItemId: burger.id, groupId: extras.id }, { menuItemId: burger.id, groupId: sauce.id, sortOrder: 1 }] });
  return { user, restaurant: r, burger, fries, extras, sauce };
}

export function orderPayload(f: Awaited<ReturnType<typeof makeRestaurant>>, key: string) {
  return {
    idempotencyKey: key,
    restaurantId: f.restaurant.id,
    fulfillment: "DELIVERY",
    items: [
      { menuItemId: f.burger.id, quantity: 2, selections: { [f.extras.id]: [f.extras.options.find((o) => o.name === "Extra cheese")!.id], [f.sauce.id]: [f.sauce.options[0].id] } },
      { menuItemId: f.fries.id, quantity: 1, selections: {} },
    ],
    customer: { name: "John Smith", phone: "70 123 456", address: "Beirut, Hamra, Main street", latitude: 33.8959, longitude: 35.4787 },
  };
}
