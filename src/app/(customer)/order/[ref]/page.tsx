import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, MessageCircle } from "lucide-react";
import { prisma } from "@/server/db";
import { deviceId } from "@/server/request";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/customer/page-header";
import { ReopenWhatsApp } from "@/components/customer/reopen-whatsapp";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ sent?: string }> }) {
  const ref = (await params).ref;
  const sp = await searchParams;
  const order = await prisma.order.findUnique({ where: { reference: ref }, include: { items: { include: { customizations: true } }, restaurant: { select: { slug: true } } } });
  if (!order) notFound();
  const dev = await deviceId();
  const owner = !!order.deviceKey && order.deviceKey === dev;

  const steps = [
    { label: "Order prepared", at: order.linkGeneratedAt, done: true },
    { label: "WhatsApp opened", at: order.handoffAt, done: !!order.handoffAt, note: "We can't see whether you pressed Send — please check WhatsApp." },
    { label: "Restaurant received your order", at: order.acknowledgedAt, done: !!order.acknowledgedAt },
    { label: order.rejectedAt ? "Restaurant couldn't take the order" : "Restaurant accepted", at: order.rejectedAt ?? order.acceptedAt, done: !!(order.acceptedAt || order.rejectedAt), bad: !!order.rejectedAt },
    ...(order.fulfillment === "DELIVERY" || order.fulfilledAt ? [{ label: order.fulfillment === "DELIVERY" ? "Delivered" : "Picked up", at: order.fulfilledAt, done: !!order.fulfilledAt }] : []),
  ];

  return (
    <main className="pb-nav">
      <PageHeader title={`Order ${order.reference}`} sub={order.restaurantName} back={false} />
      <div className="container-app space-y-4 pt-4">
        {sp.sent && (
          <div className="rounded-2xl bg-[#25D366]/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-bold text-[#128C7E]">
              <MessageCircle className="h-5 w-5" /> Did you press Send in WhatsApp?
            </div>
            <p className="mt-1 text-ink-soft">Your order only reaches {order.restaurantName} once you send the message. If WhatsApp didn&apos;t open, use the button below.</p>
          </div>
        )}
        <div className="card p-4">
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.label} className="flex gap-3">
                {s.done ? <CheckCircle2 className={`h-5 w-5 shrink-0 ${"bad" in s && s.bad ? "text-red-500" : "text-emerald-500"}`} /> : <Clock className="h-5 w-5 shrink-0 text-ink-muted/50" />}
                <div className="text-sm">
                  <div className={s.done ? "font-semibold" : "text-ink-muted"}>{s.label}</div>
                  {s.at && <div className="text-xs text-ink-muted">{formatDateTime(s.at)}</div>}
                  {"note" in s && s.note && s.done && !order.acknowledgedAt && <div className="text-xs text-ink-muted">{s.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
        {owner ? (
          <>
            <div className="card p-4 text-sm">
              {order.items.map((i) => (
                <div key={i.id} className="flex justify-between py-1">
                  <span>
                    {i.quantity} × {i.name}
                    {i.customizations.length > 0 && <span className="block text-xs text-ink-muted">{i.customizations.map((c) => c.optionName).join(" · ")}</span>}
                  </span>
                  <span className="tabular">{formatMoney(i.lineTotalCents, order.currency)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-bold">
                <span>Item subtotal</span>
                <span className="tabular">{formatMoney(order.subtotalCents, order.currency)}</span>
              </div>
              {order.fulfillment === "DELIVERY" && (
                <div className="flex justify-between text-ink-muted">
                  <span>Delivery fee</span>
                  <span>{order.deliveryFeeCents != null ? formatMoney(order.deliveryFeeCents, order.currency) : "To be confirmed"}</span>
                </div>
              )}
            </div>
            {!order.acknowledgedAt && !order.rejectedAt && <ReopenWhatsApp reference={order.reference} />}
          </>
        ) : (
          <p className="text-center text-sm text-ink-muted">For privacy, order details are only shown on the device that placed the order.</p>
        )}
        <div className="flex gap-3">
          <Link href={`/r/${order.restaurant.slug}`} className="chip flex-1 justify-center">
            Back to {order.restaurantName}
          </Link>
          <Link href="/" className="chip flex-1 justify-center">
            Keep watching
          </Link>
        </div>
      </div>
    </main>
  );
}
