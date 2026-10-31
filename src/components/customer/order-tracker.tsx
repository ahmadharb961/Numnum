"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, ChefHat, Circle, Clock, Phone, RotateCcw, Star, XCircle, Bike, ShoppingBag, PartyPopper } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { isActive, STATUS_META, type OrderStatusKey } from "@/lib/order-status";
import { NotifyPrompt } from "./notify-prompt";
import { InstallSheet } from "./install-sheet";
import { formatDateTime, cn } from "@/lib/utils";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "./page-header";
import { useCart } from "./cart";
import { api } from "./track";
import { useLocale, useT } from "@/i18n/client";

type Order = {
  reference: string;
  status: OrderStatusKey;
  fulfillment: "DELIVERY" | "PICKUP";
  createdAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  canceledAt: string | null;
  failedAt: string | null;
  estimatedMinutes: number | null;
  rejectionReason: string | null;
  failureReason: string | null;
  restaurantName: string;
  restaurantSlug: string;
  restaurantPhone: string | null;
  currency: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  changeForCents: number | null;
  customerName: string;
  address: string;
  notes: string | null;
  items: { id: string; menuItemId: string | null; name: string; quantity: number; lineTotalCents: number; options: string[]; note: string | null }[];
};

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function OrderTracker({ order: o, token, placed, loggedIn }: { order: Order; token: string; placed: boolean; loggedIn: boolean }) {
  const t = useT();
  const lang = useLocale();
  const router = useRouter();
  const toast = useToast();
  const cart = useCart();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = isActive(o.status);
  const delivery = o.fulfillment === "DELIVERY";

  // Live updates while the order is in progress.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/orders/${o.reference}/status?t=${encodeURIComponent(token)}`).then((x) => x.json());
        if (r.status && r.status !== o.status) {
          router.refresh();
          if ("vibrate" in navigator) navigator.vibrate?.(150);
        }
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, [active, o.reference, o.status, token, router]);

  const eta = o.acceptedAt && o.estimatedMinutes ? time(new Date(new Date(o.acceptedAt).getTime() + o.estimatedMinutes * 60_000).toISOString()) : null;

  const steps: { key: string; label: string; at: string | null; icon: React.ReactNode }[] = [
    { key: "PLACED", label: t("Order placed"), at: o.createdAt, icon: <CheckCircle2 /> },
    { key: "ACCEPTED", label: t("Accepted by the restaurant"), at: o.acceptedAt, icon: <CheckCircle2 /> },
    { key: "PREPARING", label: t("Preparing your food"), at: o.preparingAt, icon: <ChefHat /> },
    { key: "DISPATCHED", label: delivery ? t("Out for delivery") : t("Ready for pickup"), at: o.dispatchedAt, icon: delivery ? <Bike /> : <ShoppingBag /> },
    { key: "COMPLETED", label: delivery ? t("Delivered") : t("Picked up"), at: o.completedAt, icon: <PartyPopper /> },
  ];
  const bad = o.status === "REJECTED" || o.status === "CANCELED" || o.status === "FAILED";

  async function cancel() {
    setBusy(true);
    try {
      await api(`/api/orders/${o.reference}/cancel`, { token });
      toast("Order canceled");
      setCancelOpen(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function reorder() {
    setBusy(true);
    try {
      const r = await api<{ restaurant: { id: string; slug: string; name: string; currency: string }; lines: Parameters<typeof cart.replaceWith>[1]; skipped: number }>(`/api/orders/${o.reference}/reorder?t=${encodeURIComponent(token)}`, undefined, "GET");
      if (!r.lines.length) throw new Error("These items aren't available anymore");
      cart.replaceWith(r.restaurant, r.lines);
      if (r.skipped) toast(`${r.skipped} item(s) are no longer available`);
      router.push("/cart");
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  return (
    <main className="pb-nav">
      <PageHeader title={t("Order {ref}", { ref: o.reference })} sub={o.restaurantName} back={!placed} />
      <div className="container-app space-y-4 pt-4">
        {placed && o.status === "PLACED" && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-5 w-5" /> {t("Order sent to {name}", { name: o.restaurantName })}
            </div>
            <p className="mt-1">{t("You'll see updates here as soon as they accept it.")}{!loggedIn && " " + t("Keep this page or bookmark the link to track it.")}</p>
          </div>
        )}

        {loggedIn && active && <NotifyPrompt compact />}
        {placed && active && <InstallSheet reference={o.reference} />}

        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Badge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Badge>
              <h2 data-testid="order-status" className="mt-2 text-xl font-extrabold leading-tight">{o.status === "COMPLETED" ? (delivery ? t("Enjoy your meal!") : t("Picked up — enjoy!")) : t(STATUS_META[o.status].customer)}</h2>
              {eta && active && o.status !== "PLACED" && (
                <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                  <Clock className="h-4 w-4" /> {delivery ? t("Arriving around") : t("Ready around")} {eta}
                </p>
              )}
              {o.status === "PLACED" && <p className="mt-1 text-sm text-ink-muted">{t("Usually within a few minutes.")}</p>}
            </div>
            {active && <span className="relative mt-1 flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" /></span>}
          </div>

          {bad ? (
            <Alert tone="red" className="mt-4">
              <XCircle className="me-1 inline h-4 w-4" />
              {o.status === "REJECTED" && (o.rejectionReason ? t("The restaurant couldn't accept this order: {reason}", { reason: t(o.rejectionReason) }) : t("The restaurant couldn't accept this order."))}
              {o.status === "CANCELED" && (o.canceledAt ? t("This order was canceled at {time}. You won't be charged.", { time: time(o.canceledAt) }) : t("This order was canceled. You won't be charged."))}
              {o.status === "FAILED" && (o.failureReason ? t("The order couldn't be completed: {reason}", { reason: t(o.failureReason) }) : t("The order couldn't be completed."))}
            </Alert>
          ) : (
            <ol className="mt-5 space-y-3">
              {steps.map((s) => (
                <li key={s.key} className="flex gap-3">
                  <span className={cn("[&_svg]:h-5 [&_svg]:w-5", s.at ? "text-emerald-500" : "text-ink-muted/40")}>{s.at ? s.icon : <Circle />}</span>
                  <div className="text-sm">
                    <div className={s.at ? "font-semibold" : "text-ink-muted"}>{s.label}</div>
                    {s.at && <div className="text-xs text-ink-muted">{time(s.at)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {o.restaurantPhone && (
              <a href={`tel:+${o.restaurantPhone}`} className={buttonClass("outline", "sm")}>
                <Phone className="h-4 w-4" /> Call {formatPhone(o.restaurantPhone)}
              </a>
            )}
            {o.status === "PLACED" && (
              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setCancelOpen(true)}>
                {t("Cancel order")}
              </Button>
            )}
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Banknote className="h-5 w-5 text-emerald-600" /> {delivery ? t("Cash on delivery") : t("Cash at pickup")}: {formatMoney(o.totalCents, o.currency)}
          </div>
          {o.changeForCents && <p className="mb-2 text-xs text-ink-muted">You&apos;ll pay with {formatMoney(o.changeForCents, o.currency)} — change: {formatMoney(o.changeForCents - o.totalCents, o.currency)}</p>}
          <div className="divide-y divide-black/5 text-sm">
            {o.items.map((i) => (
              <div key={i.id} className="flex justify-between gap-3 py-2">
                <span>
                  {i.quantity} × {i.name}
                  {i.options.length > 0 && <span className="block text-xs text-ink-muted">{i.options.join(" · ")}</span>}
                  {i.note && <span className="block text-xs italic text-ink-muted">“{i.note}”</span>}
                </span>
                <span className="tabular">{formatMoney(i.lineTotalCents, o.currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1 border-t border-black/10 pt-2 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>{t("Subtotal")}</span>
              <span className="tabular">{formatMoney(o.subtotalCents, o.currency)}</span>
            </div>
            {delivery && (
              <div className="flex justify-between text-ink-muted">
                <span>{t("Delivery fee")}</span>
                <span className="tabular">{o.deliveryFeeCents ? formatMoney(o.deliveryFeeCents, o.currency) : t("Free")}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold">
              <span>{t("Total")}</span>
              <span className="tabular">{formatMoney(o.totalCents, o.currency)}</span>
            </div>
          </div>
          <div className="mt-3 border-t border-black/5 pt-3 text-xs text-ink-muted">
            {delivery ? t("Deliver to {name}: {address}", { name: o.customerName, address: o.address }) : t("Pickup by {name}", { name: o.customerName })}
            {o.notes && <> · Note: {o.notes}</>}
            <div>{t("Placed {date}", { date: formatDateTime(o.createdAt, lang) })}</div>
          </div>
        </div>

        {o.status === "COMPLETED" && (
          <div className="card flex items-center justify-between gap-3 p-4">
            <div className="text-sm">
              <div className="font-bold">{t("How was it?")}</div>
              <div className="text-ink-muted">{t("Your review helps other food lovers.")}</div>
            </div>
            <Link href={`/r/${o.restaurantSlug}/review`} className={buttonClass("secondary", "sm")}>
              <Star className="h-4 w-4" /> {t("Review")}
            </Link>
          </div>
        )}

        <div className="flex gap-3">
          {!active && (
            <Button variant="dark" className="flex-1" loading={busy} onClick={reorder}>
              <RotateCcw className="h-4 w-4" /> {t("Order again")}
            </Button>
          )}
          <Link href={`/r/${o.restaurantSlug}`} className="chip flex-1 justify-center">
            {o.restaurantName}
          </Link>
        </div>
        {!loggedIn && (
          <div className="rounded-2xl bg-white p-4 text-center text-sm">
            <Link href={`/account/register?next=/account/orders`} className="font-semibold text-brand-600">
              {t("Create an account")}
            </Link>{" "}
            to keep your order history and saved addresses. This order will be added automatically.
          </div>
        )}
      </div>
      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?">
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-soft">You can cancel until {o.restaurantName} accepts the order.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t("Keep order")}
            </Button>
            <Button variant="danger" loading={busy} onClick={cancel}>
              {t("Cancel order")}
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
