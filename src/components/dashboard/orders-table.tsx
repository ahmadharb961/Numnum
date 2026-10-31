"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Bike, Check, ChevronDown, Clock, MapPin, MessageCircle, Phone, X } from "lucide-react";
import { driverWhatsAppUrl } from "@/lib/driver-message";
import { orderAction } from "@/actions/orders";
import { formatMoney, formatRate } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { STATUS_META, isActive, type OrderStatusKey } from "@/lib/order-status";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Order = {
  id: string;
  reference: string;
  createdAt: string;
  status: OrderStatusKey;
  fulfillment: "DELIVERY" | "PICKUP";
  customerName: string;
  customerPhone: string;
  address: string;
  notes: string | null;
  mapsUrl: string | null;
  currency: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  changeForCents: number | null;
  estimatedMinutes: number | null;
  acceptedAt: string | null;
  reason: string | null;
  canceledBy: string | null;
  autoCompleted: boolean;
  items: { name: string; quantity: number; lineTotalCents: number; options: string[]; note: string | null }[];
  commission: { commissionCents: number; status: string; rateBps: number } | null;
};

const REJECT_REASONS = ["Item(s) unavailable", "Outside delivery area", "Too busy right now", "Closing soon", "Customer unreachable"];
const FAIL_REASONS = ["Customer unreachable", "Customer refused the order", "Wrong address", "Customer didn't pick up"];
const ETAS = [15, 20, 30, 45, 60, 90];

function minutesAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : formatDateTime(iso);
}

export function OrdersTable({ orders, defaultEta, restaurantName }: { orders: Order[]; defaultEta: number; restaurantName: string }) {
  // Active orders start open (staff need the address, phone and next step); closed ones start collapsed.
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setToggled((t) => {
    const n = new Set(t);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const [reasonFor, setReasonFor] = useState<{ order: Order; kind: "REJECT" | "FAIL" } | null>(null);
  const [reason, setReason] = useState("");
  const [etaFor, setEtaFor] = useState<Record<string, number>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const act = (id: string, a: "ACCEPT" | "REJECT" | "PREPARING" | "DISPATCH" | "COMPLETE" | "FAIL", opts: { reason?: string; etaMinutes?: number } = {}) =>
    start(async () => {
      const r = await orderAction(id, a, opts);
      if (r.ok) toast(r.message ?? "Done", "success");
      else toast(r.error, "error");
      router.refresh();
    });

  if (!orders.length) return <div className="card"><EmptyState title="No orders here" body="New orders appear here instantly, with a sound alert if you turn it on." /></div>;

  return (
    <div className={cn("space-y-2.5", pending && "opacity-70")}>
      {orders.map((o) => {
        const s = STATUS_META[o.status];
        const expanded = isActive(o.status) !== toggled.has(o.id);
        const delivery = o.fulfillment === "DELIVERY";
        const due = o.acceptedAt && o.estimatedMinutes ? new Date(new Date(o.acceptedAt).getTime() + o.estimatedMinutes * 60000) : null;
        return (
          <div key={o.id} className={cn("card overflow-hidden", o.status === "PLACED" && "ring-2 ring-brand-500")}>
            <button onClick={() => toggle(o.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold">{o.reference}</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <Badge>{delivery ? "Delivery" : "Pickup"}</Badge>
                  {o.autoCompleted && <Badge tone="amber">auto-completed</Badge>}
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-semibold">{o.customerName}</span>{" "}
                  <span className="text-ink-muted">
                    · {o.items.reduce((n, i) => n + i.quantity, 0)} items · {minutesAgo(o.createdAt)}
                    {due && ["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"].includes(o.status) && <> · due {due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Beirut" })}</>}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="tabular font-extrabold">{formatMoney(o.totalCents, o.currency)}</div>
                <div className="text-xs text-ink-muted">cash to collect</div>
              </div>
              <ChevronDown className={cn("h-5 w-5 text-ink-muted transition", expanded && "rotate-180")} />
            </button>
            {o.status === "PLACED" && (
              // New order: the decision comes first, with big green/red buttons.
              <div className="border-t border-black/5 bg-white p-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
                  <Clock className="h-3.5 w-3.5" /> {delivery ? "Delivery time" : "Ready in"}
                </div>
                <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
                  {Array.from(new Set([defaultEta, ...ETAS]))
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEtaFor((e) => ({ ...e, [o.id]: m }))}
                        className={cn("h-10 shrink-0 rounded-full border-2 px-4 text-sm font-bold transition", (etaFor[o.id] ?? defaultEta) === m ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-black/10 bg-white text-ink-soft")}
                      >
                        {m} min
                      </button>
                    ))}
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setReasonFor({ order: o, kind: "REJECT" });
                      setReason("");
                    }}
                    className="flex h-14 items-center justify-center gap-1.5 rounded-2xl bg-red-600 text-base font-extrabold text-white shadow-lg shadow-red-600/25 transition active:scale-[0.97] disabled:opacity-60"
                  >
                    <X className="h-5 w-5" strokeWidth={3} /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(o.id, "ACCEPT", { etaMinutes: etaFor[o.id] ?? defaultEta })}
                    className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-extrabold text-white shadow-lg shadow-emerald-600/30 transition active:scale-[0.97] disabled:opacity-60"
                  >
                    <Check className="h-6 w-6" strokeWidth={3} /> Accept · {etaFor[o.id] ?? defaultEta} min
                  </button>
                </div>
              </div>
            )}
            {expanded && (
              <div className="grid gap-4 border-t border-black/5 bg-cream/50 p-4 md:grid-cols-2">
                <div className="space-y-1.5 text-sm">
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">Customer</div>
                  <div className="font-semibold">{o.customerName}</div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`tel:+${o.customerPhone}`} className="chip h-8 text-xs">
                      <Phone className="h-3.5 w-3.5" /> {formatPhone(o.customerPhone)}
                    </a>
                    <a href={`https://wa.me/${o.customerPhone}`} target="_blank" rel="noopener noreferrer" className="chip h-8 text-xs">
                      <MessageCircle className="h-3.5 w-3.5" /> Message
                    </a>
                    {o.mapsUrl && (
                      <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="chip h-8 text-xs">
                        <MapPin className="h-3.5 w-3.5" /> Map
                      </a>
                    )}
                  </div>
                  {delivery && o.address && <div>{o.address}</div>}
                  {o.notes && <div className="text-ink-muted">Note: {o.notes}</div>}
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">
                    <Banknote className="h-4 w-4" />
                    <span>
                      Collect <b>{formatMoney(o.totalCents, o.currency)}</b> cash
                      {o.changeForCents ? (
                        <>
                          {" "}
                          · pays with {formatMoney(o.changeForCents, o.currency)}, bring <b>{formatMoney(o.changeForCents - o.totalCents, o.currency)}</b> change
                        </>
                      ) : null}
                    </span>
                  </div>
                  {o.reason && <div className="text-xs text-red-600">{o.status === "CANCELED" ? `Canceled by ${o.canceledBy === "ADMIN" ? "numnum" : "customer"}` : "Reason"}: {o.reason}</div>}
                </div>
                <div className="text-sm">
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">Items</div>
                  <ul className="mt-1 space-y-1.5">
                    {o.items.map((i, idx) => (
                      <li key={idx} className="flex justify-between gap-3">
                        <span>
                          <b>{i.quantity}×</b> {i.name}
                          {i.options.length > 0 && <span className="block text-xs text-ink-muted">{i.options.join(" · ")}</span>}
                          {i.note && <span className="block text-xs italic text-ink-muted">“{i.note}”</span>}
                        </span>
                        <span className="tabular">{formatMoney(i.lineTotalCents, o.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 space-y-0.5 border-t border-black/10 pt-2">
                    <div className="flex justify-between text-ink-muted">
                      <span>Subtotal</span>
                      <span className="tabular">{formatMoney(o.subtotalCents, o.currency)}</span>
                    </div>
                    {delivery && (
                      <div className="flex justify-between text-ink-muted">
                        <span>Delivery fee</span>
                        <span className="tabular">{formatMoney(o.deliveryFeeCents, o.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span className="tabular">{formatMoney(o.totalCents, o.currency)}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-ink-muted">Commission</span>
                    <span>{o.commission ? `${formatMoney(o.commission.commissionCents)} (${formatRate(o.commission.rateBps)}) · ${o.commission.status.toLowerCase()}` : "None yet"}</span>
                  </div>
                </div>
                <div className="space-y-3 md:col-span-2">
                  {delivery && ["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY"].includes(o.status) && (
                    <a href={driverWhatsAppUrl(o, restaurantName)} target="_blank" rel="noopener noreferrer" className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-bold text-white hover:bg-[#1ebe5b] sm:w-auto sm:px-5">
                      <Bike className="h-4 w-4" /> Send to driver on WhatsApp
                    </a>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {o.status === "ACCEPTED" && (
                      <Button size="sm" variant="outline" onClick={() => act(o.id, "PREPARING")}>
                        Start preparing
                      </Button>
                    )}
                    {(o.status === "ACCEPTED" || o.status === "PREPARING") && (
                      <Button size="sm" variant="dark" onClick={() => act(o.id, "DISPATCH")}>
                        {delivery ? "Out for delivery" : "Ready for pickup"}
                      </Button>
                    )}
                    {["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"].includes(o.status) && (
                      <>
                        <Button size="sm" onClick={() => act(o.id, "COMPLETE")}>
                          {delivery ? "Delivered" : "Picked up"} · cash collected
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { setReasonFor({ order: o, kind: "FAIL" }); setReason(""); }}>
                          {delivery ? "Couldn't deliver" : "Not picked up"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Sheet open={!!reasonFor} onClose={() => setReasonFor(null)} title={reasonFor?.kind === "REJECT" ? `Reject ${reasonFor.order.reference}` : `Report problem · ${reasonFor?.order.reference ?? ""}`}>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            {(reasonFor?.kind === "REJECT" ? REJECT_REASONS : FAIL_REASONS).map((r) => (
              <button key={r} onClick={() => setReason(r)} className={cn("chip text-xs", reason === r && "chip-active")}>
                {r}
              </button>
            ))}
          </div>
          <textarea className="input" placeholder={reasonFor?.kind === "REJECT" ? "Reason (shown to the customer)" : "What happened?"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <p className="text-xs text-ink-muted">{reasonFor?.kind === "REJECT" ? "The customer is notified right away. Frequent rejections are reviewed by numnum." : "Failed deliveries are reviewed by numnum. Use this only when the customer didn't receive the order."}</p>
          <Button
            variant="danger"
            block
            disabled={!reason.trim()}
            onClick={() => {
              act(reasonFor!.order.id, reasonFor!.kind, { reason });
              setReasonFor(null);
            }}
          >
            {reasonFor?.kind === "REJECT" ? "Reject order" : "Mark as not delivered"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
