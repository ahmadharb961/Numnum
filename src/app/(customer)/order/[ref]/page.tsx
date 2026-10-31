import type { Metadata } from "next";
import Link from "next/link";
import { loadCustomerOrder } from "@/server/order-view";
import { getCurrentUser } from "@/server/auth";
import { OrderTracker } from "@/components/customer/order-tracker";
import { PageHeader } from "@/components/customer/page-header";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Your order"), robots: { index: false } };
}
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ t?: string; placed?: string }> }) {
  const t = await getT();
  const ref = (await params).ref;
  const sp = await searchParams;
  const r = await loadCustomerOrder(ref, sp.t);
  if (!r) {
    return (
      <main className="pb-nav">
        <PageHeader title="Order" />
        <div className="container-app py-16 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="mt-3 text-lg font-bold">{t("We couldn't open this order")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("Orders are visible on the device that placed them, with the order link, or in your account.")}</p>
          <Link href="/login?next=/account/orders" className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand-500 px-5 font-semibold text-white">
            {t("Log in to see your orders")}
          </Link>
        </div>
      </main>
    );
  }
  const o = r.order;
  const user = await getCurrentUser();
  return (
    <OrderTracker
      placed={sp.placed === "1"}
      token={sp.t ?? o.trackingToken}
      loggedIn={!!user}
      order={{
        reference: o.reference,
        status: o.status,
        fulfillment: o.fulfillment,
        createdAt: o.createdAt.toISOString(),
        acceptedAt: o.acceptedAt?.toISOString() ?? null,
        preparingAt: o.preparingAt?.toISOString() ?? null,
        dispatchedAt: o.dispatchedAt?.toISOString() ?? null,
        completedAt: o.completedAt?.toISOString() ?? null,
        rejectedAt: o.rejectedAt?.toISOString() ?? null,
        canceledAt: o.canceledAt?.toISOString() ?? null,
        failedAt: o.failedAt?.toISOString() ?? null,
        estimatedMinutes: o.estimatedMinutes,
        rejectionReason: o.rejectionReason,
        failureReason: o.failureReason,
        restaurantName: o.restaurantName,
        restaurantSlug: o.restaurant.slug,
        restaurantPhone: o.restaurantPhone ?? o.restaurant.phone,
        currency: o.currency,
        subtotalCents: o.subtotalCents,
        deliveryFeeCents: o.deliveryFeeCents,
        totalCents: o.totalCents,
        changeForCents: o.changeForCents,
        customerName: o.customerName,
        address: [o.deliveryArea, o.address, o.building].filter(Boolean).join(", "),
        notes: o.notes,
        items: o.items.map((i) => ({ id: i.id, menuItemId: i.menuItemId, name: i.name, quantity: i.quantity, lineTotalCents: i.lineTotalCents, options: i.customizations.map((c) => c.optionName), note: i.specialInstructions })),
      }}
    />
  );
}
