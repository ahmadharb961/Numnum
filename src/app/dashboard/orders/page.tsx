import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { DashPage } from "@/components/dashboard/page";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { AckByReference } from "@/components/dashboard/ack-by-reference";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { cn } from "@/lib/utils";

export const metadata = { title: "Order requests" };

const TABS = {
  pending: { label: "Awaiting acknowledgment", where: { status: { in: ["LINK_GENERATED", "HANDOFF_ATTEMPTED", "MESSAGE_CONFIRMED"] } } },
  active: { label: "In progress", where: { status: { in: ["ACKNOWLEDGED", "ACCEPTED"] } } },
  done: { label: "Fulfilled", where: { status: "FULFILLED" } },
  rejected: { label: "Rejected / canceled", where: { status: { in: ["REJECTED", "CANCELED", "DISPUTED"] } } },
  all: { label: "All", where: {} },
} satisfies Record<string, { label: string; where: Prisma.OrderWhereInput }>;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; ref?: string; page?: string }> }) {
  const ctx = await requireRestaurant("STAFF");
  const sp = await searchParams;
  const tab = (sp.tab && sp.tab in TABS ? sp.tab : sp.ref ? "all" : "pending") as keyof typeof TABS;
  const page = Math.max(1, Number(sp.page) || 1);
  const settings = await getSettings();
  const where: Prisma.OrderWhereInput = { restaurantId: ctx.restaurant.id, ...TABS[tab].where, ...(sp.ref ? { reference: { contains: sp.ref.trim().toUpperCase() } } : {}) };
  const [orders, total, counts] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { items: { include: { customizations: true } }, commission: { select: { commissionCents: true, status: true, rateBps: true } } } }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ["status"], where: { restaurantId: ctx.restaurant.id }, _count: true }),
  ]);
  const countFor = (k: keyof typeof TABS) => {
    const st = (TABS[k].where as { status?: { in?: string[] } | string }).status;
    if (!st) return counts.reduce((s, c) => s + c._count, 0);
    const list = typeof st === "string" ? [st] : st.in ?? [];
    return counts.filter((c) => list.includes(c.status)).reduce((s, c) => s + c._count, 0);
  };
  const billable = { ACKNOWLEDGED: "acknowledge", ACCEPTED: "accept", FULFILLED: "mark fulfilled", MESSAGE_CONFIRMED: "acknowledge" }[settings.billableEvent];

  return (
    <DashPage title="Order requests" description={<>When a customer&apos;s WhatsApp order arrives, acknowledge it here using the order reference. Commission applies only to orders you {billable}.</>}>
      <AutoRefresh seconds={30} />
      <AckByReference />
      <div className="no-scrollbar -mx-4 my-4 flex gap-2 overflow-x-auto px-4">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
          <Link key={k} href={`/dashboard/orders?tab=${k}`} className={cn("chip h-9 text-xs", tab === k && "chip-active")}>
            {TABS[k].label} <span className="opacity-60">{countFor(k)}</span>
          </Link>
        ))}
      </div>
      <OrdersTable
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
          handoffAt: o.handoffAt?.toISOString() ?? null,
          handoffCount: o.handoffCount,
          acknowledgedAt: o.acknowledgedAt?.toISOString() ?? null,
          rejectionReason: o.rejectionReason,
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
