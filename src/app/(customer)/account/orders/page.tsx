import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/customer/page-header";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { STATUS_META } from "@/lib/order-status";

export const metadata = { title: "My orders", robots: { index: false } };

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/account/orders");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const orders = await prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 21, include: { items: { select: { name: true, quantity: true } }, restaurant: { select: { logoUrl: true } } } });
  return (
    <main className="pb-nav">
      <PageHeader title="My orders" />
      <div className="container-app space-y-2.5 pt-4">
        {!orders.length && <EmptyState icon={<Receipt />} title="No orders yet" body="Your orders will appear here." action={<Link href="/" className="chip chip-active">Find something tasty</Link>} />}
        {orders.slice(0, 20).map((o) => (
          <Link key={o.id} href={`/order/${o.reference}`} className="card flex gap-3 p-3.5">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-brand-50">
              {o.restaurant.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.restaurant.logoUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-bold">{o.restaurantName}</span>
                <span className="tabular shrink-0 font-semibold">{formatMoney(o.totalCents, o.currency)}</span>
              </div>
              <div className="truncate text-xs text-ink-muted">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                <Badge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Badge>
                {formatDateTime(o.createdAt)}
              </div>
            </div>
          </Link>
        ))}
        {orders.length > 20 && (
          <div className="pt-2 text-center">
            <Link className="chip" href={`/account/orders?page=${page + 1}`}>
              Older orders
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
