// Store screenshots only: gives the demo Pizza Forno a month of believable activity (orders from
// named customers in Jounieh, visits, reel views), so its own dashboard can be shown. Run against
// the screenshot database, never production:
//   DATABASE_URL=…/numnum_shots npx tsx --tsconfig tsconfig.json --require ./scripts/cli-shim.cjs scripts/store-screens/pizza-story.ts
import { prisma } from "../../src/server/db";
import { createOrder, restaurantOrderAction } from "../../src/server/orders";

const NAMES = ["Maya Khoury", "Karim Nassar", "Lara Saade", "Georges Aoun", "Nour Fakhoury", "Omar Itani", "Hiba Mansour", "Tarek Salem", "Joanna Rizk", "Elie Haddad", "Sara Chidiac", "Rami Daher"];
const STREETS = ["Jounieh old souk, near the church", "Kaslik main road, above the bakery", "Sahel Alma, Al Yasmine bldg", "Haret Sakher, facing the school", "Ghadir, Rizk tower 2nd floor"];

async function main() {
  if (!/numnum_shots/.test(process.env.DATABASE_URL ?? "")) throw new Error("Run this against the screenshot database (numnum_shots) only.");
  const r = await prisma.restaurant.findUniqueOrThrow({ where: { slug: "pizza-forno" }, include: { staff: true } });
  const ownerId = r.staff[0].userId;
  const items = await prisma.menuItem.findMany({ where: { restaurantId: r.id, archived: false }, include: { customizations: { include: { group: { include: { options: true } } } } } });
  const pick = (name: string) => items.find((i) => i.name === name)!;
  // Required choices: the default (or first) option of each required group.
  const selections = (item: (typeof items)[number]) =>
    Object.fromEntries(item.customizations.map((c) => c.group).filter((g) => g.required).map((g) => [g.id, [(g.options.find((o) => o.isDefault) ?? g.options[0]).id]]));
  const baskets = [["Margherita", "Tiramisu"], ["Pepperoni"], ["Quattro Formaggi", "Caesar Salad"], ["Truffle Mushroom Pizza"], ["Margherita", "Pepperoni"], ["Truffle Pasta", "Tiramisu"]];

  const users: { id: string; name: string; phone: string | null }[] = [];
  for (const [i, name] of NAMES.entries()) {
    const email = `pf${i}@numnum.demo`;
    users.push(
      (await prisma.user.findUnique({ where: { email } })) ??
        (await prisma.user.create({ data: { email, name, phone: `96176${String(100 + i).padStart(3, "0")}456`, passwordHash: "x", emailVerifiedAt: new Date(), roles: { create: { role: "CUSTOMER" } } } })),
    );
  }

  const place = async (n: number, plan: "complete" | "placed" | "preparing") => {
    const u = users[n % users.length];
    const basket = baskets[n % baskets.length].map((name) => ({ menuItemId: pick(name).id, quantity: name === "Margherita" && n % 3 === 0 ? 2 : 1, selections: selections(pick(name)) }));
    const o = await createOrder(
      {
        idempotencyKey: `pf-story-${n}-xxxxxxxxxxxxxxxxxxxx`,
        restaurantId: r.id,
        fulfillment: n % 4 === 3 ? "PICKUP" : "DELIVERY",
        changeFor: n % 3 === 0 ? "50" : null,
        items: basket,
        customer: { name: u.name, phone: u.phone!.replace(/^961/, ""), address: STREETS[n % STREETS.length], building: `Floor ${1 + (n % 6)}`, area: "Jounieh", latitude: 33.9712 + (n % 5) * 0.002, longitude: 35.6121 + (n % 4) * 0.002 },
      },
      { deviceKey: `pf-device-${n}-aaaaaaaaaaaa`, ipHash: null, userId: u.id },
    );
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    const act = (a: Parameters<typeof restaurantOrderAction>[3], opts = {}) => restaurantOrderAction(r.id, ownerId, order.id, a, opts);
    if (plan !== "placed") {
      await act("ACCEPT", { etaMinutes: 30 });
      await act("PREPARING");
      if (plan === "complete") {
        await act("DISPATCH");
        await act("COMPLETE");
      }
    }
    return order;
  };

  // A month of completed orders…
  for (let n = 0; n < 46; n++) {
    const o = await place(n, "complete");
    const when = new Date(Date.now() - (1 + Math.floor((n * 29) / 46)) * 86400_000 - (n % 6) * 3600_000);
    await prisma.order.update({ where: { id: o.id }, data: { createdAt: when, acceptedAt: when, completedAt: new Date(when.getTime() + 35 * 60_000), reviewDismissedAt: new Date() } });
    await prisma.commissionEvent.updateMany({ where: { orderId: o.id }, data: { createdAt: when } });
  }
  // …one being prepared, and a new one just in.
  await place(100, "preparing");
  await place(101, "placed");

  // Visits and reel views over the same month.
  const reels = await prisma.reel.findMany({ where: { restaurantId: r.id }, select: { id: true } });
  const visits = [];
  const views = [];
  for (let day = 0; day < 30; day++) {
    const base = Date.now() - day * 86400_000;
    const n = 40 + ((day * 37) % 60);
    for (let j = 0; j < n; j++) visits.push({ type: "restaurant_opened", restaurantId: r.id, deviceKey: `pf-visitor-${(day * 11 + j) % 400}`, createdAt: new Date(base - j * 400_000) });
    for (const [ri, reel] of reels.entries()) for (let j = 0; j < n * (4 - ri); j++) views.push({ reelId: reel.id, viewerKey: `d:pf-${day}-${ri}-${j}`, watchMs: 5000, createdAt: new Date(base - j * 200_000) });
  }
  await prisma.analyticsEvent.createMany({ data: visits });
  await prisma.reelView.createMany({ data: views });
  for (const reel of reels) await prisma.reel.update({ where: { id: reel.id }, data: { viewCount: await prisma.reelView.count({ where: { reelId: reel.id } }) } });
  await prisma.restaurant.update({ where: { id: r.id }, data: { totalReelViews: views.length } });
  console.log(`Pizza Forno: 48 orders, ${visits.length} visits, ${views.length} reel views`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
