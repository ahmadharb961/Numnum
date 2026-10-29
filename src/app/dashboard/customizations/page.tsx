import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { CustomizationManager } from "@/components/dashboard/customization-manager";
import { minorDigits } from "@/lib/money";

export const metadata = { title: "Customizations" };

export default async function CustomizationsPage() {
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const groups = await prisma.customizationGroup.findMany({
    where: { restaurantId: r.id },
    orderBy: { name: "asc" },
    include: { options: { orderBy: { sortOrder: "asc" } }, items: { include: { menuItem: { select: { name: true } } } } },
  });
  const d = minorDigits(r.currency);
  return (
    <DashPage title="Customizations" description="Reusable option groups — sizes, extras, sauces, cooking preferences. Attach them to any number of menu items.">
      <CustomizationManager
        currency={r.currency}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          required: g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          usedBy: g.items.map((i) => i.menuItem.name),
          options: g.options.map((o) => ({ id: o.id, name: o.name, price: (o.priceDeltaCents / 10 ** d).toFixed(d), available: o.available, isDefault: o.isDefault })),
        }))}
      />
    </DashPage>
  );
}
