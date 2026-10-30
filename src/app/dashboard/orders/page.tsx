import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage } from "@/components/dashboard/page";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orders" };

const TABS = {
  new: { label: "New", where: { status: "PLACED" } },
  active: { label: "In progress", where: { status: { in: ["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] } } },
  done: { label: "Completed", where: { status: "COMPLETED" } },
  closed: { label: "Rejected / canceled", where: { status: { in: ["REJECTED", "CANCELED", "FAILED"] } } },
  all: { label: "All", where: {} },
} satisfies Record<string, { label: string; where: Prisma.OrderWhereInput }>;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; ref?: string; page?: string }> }) {
  const ctx = await requireRestaurant("STAFF");
  const sp = await searchParams;
  const counts = await prisma.order.groupBy({ by: ["status"], where: { restaurantId: ctx.restaurant.id }, _count: true });
  const countFor = (k: keyof typeof TABS) => {
    const st = (TABS[k].where as { status?: { in?: string[] } | string }).status;
    if (!st) return counts.reduce((s, c) => s + c._count, 0);
    const list = typeof st === "string" ? [st] : st.in ?? [];
    return counts.filter((c) => list.includes(c.status)).reduce((s, c) => s + c._count, 0);
  };
  const defaultTab = countFor("new") ? "new" : "active";
  const tab = (sp.tab && sp.tab in TABS ? sp.tab : sp.ref ? "all" : defaultTab) as keyof typeof TABS;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.OrderWhereInput = { restaurantId: ctx.restaurant.id, ...TABS[tab].where, ...(sp.ref ? { reference: { contains: sp.ref.trim().toUpperCase() } } : {}) };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: tab === "new" || tab === "active" ? "asc" : "desc" }, skip: (page - 1) * 30, take: 30, include: { items: { include: { customizations: true } }, commission: { select: { commissionCents: true, status: true, rateBps: true } } } }),
    prisma.order.count({ where }),
  ]);

  return (
    <DashPage title="Orders" description="Accept new orders quickly — customers see every update live. Payment is cash on delivery, collected by you.">
      <form className="mb-3 flex gap-2">
        <input name="ref" defaultValue={sp.ref} className="input h-10 max-w-xs font-mono text-sm uppercase" placeholder="Find by reference" />
      </form>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
          <Link key={k} href={`/dashboard/orders?tab=${k}`} className={cn("chip h-9 text-xs", tab === k && "chip-active", k === "new" && countFor("new") > 0 && tab !== k && "border-brand-500 text-brand-600")}>
            {TABS[k].label} <span className="opacity-60">{countFor(k)}</span>
          </Link>
        ))}
      </div>
      <OrdersTable
        defaultEta={ctx.restaurant.avgPrepMinutes}
        orders={orders.map((o) => ({
          id: o.id,
          reference: o.reference,
          createdAt: o.createdAt.toISOString(),
          status: o.status,
          fulfillment: o.fulfillment,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          address: [o.deliveryArea, o.address, o.building].filter(Boolean).join(", "),
          notes: o.notes,
          mapsUrl: o.mapsUrl,
          currency: o.currency,
          subtotalCents: o.subtotalCents,
          deliveryFeeCents: o.deliveryFeeCents,
          totalCents: o.totalCents,
          changeForCents: o.changeForCents,
          estimatedMinutes: o.estimatedMinutes,
          acceptedAt: o.acceptedAt?.toISOString() ?? null,
          reason: o.rejectionReason ?? o.failureReason ?? o.cancelReason,
          canceledBy: o.canceledBy,
          autoCompleted: o.autoCompleted,
          items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotalCents: i.lineTotalCents, options: i.customizations.map((c) => c.optionName), note: i.specialInstructions })),
          commission: o.commission,
        }))}
      />
      {total > page * 30 && (
        <div className="mt-4 text-center">
          <Link className="chip" href={`/dashboard/orders?tab=${tab}&page=${page + 1}`}>
            Load more
          </Link>
        </div>
      )}
    </DashPage>
  );
}
