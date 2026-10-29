"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin, MessageCircle, Phone } from "lucide-react";
import { orderAction } from "@/actions/orders";
import { formatMoney, formatRate } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Order = {
  id: string;
  reference: string;
  createdAt: string;
  status: string;
  fulfillment: string;
  customerName: string;
  customerPhone: string;
  address: string;
  notes: string | null;
  mapsUrl: string | null;
  currency: string;
  subtotalCents: number;
  deliveryFeeCents: number | null;
  handoffAt: string | null;
  handoffCount: number;
  acknowledgedAt: string | null;
  rejectionReason: string | null;
  items: { name: string; quantity: number; lineTotalCents: number; options: string[]; note: string | null }[];
  commission: { commissionCents: number; status: string; rateBps: number } | null;
};

export const STATUS_LABEL: Record<string, { label: string; tone: "gray" | "blue" | "amber" | "green" | "red" | "purple" }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  VALIDATED: { label: "Prepared", tone: "gray" },
  LINK_GENERATED: { label: "Prepared · WhatsApp not opened", tone: "gray" },
  HANDOFF_ATTEMPTED: { label: "WhatsApp opened", tone: "blue" },
  MESSAGE_CONFIRMED: { label: "Message delivered", tone: "blue" },
  ACKNOWLEDGED: { label: "Acknowledged", tone: "purple" },
  ACCEPTED: { label: "Accepted", tone: "amber" },
  REJECTED: { label: "Rejected", tone: "red" },
  FULFILLED: { label: "Fulfilled", tone: "green" },
  CANCELED: { label: "Canceled", tone: "red" },
  DISPUTED: { label: "Disputed", tone: "red" },
};

const REJECT_REASONS = ["Item(s) unavailable", "Outside delivery area", "Closed / too busy", "Customer unreachable", "Duplicate order", "Customer canceled", "Did not receive WhatsApp message"];

export function OrdersTable({ orders }: { orders: Order[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const act = (id: string, a: "ACKNOWLEDGE" | "ACCEPT" | "REJECT" | "FULFILL", why?: string) =>
    start(async () => {
      const r = await orderAction(id, a, why);
      if (r.ok) toast(r.message ?? "Done", "success");
      else toast(r.error, "error");
      router.refresh();
    });

  if (!orders.length) return <div className="card"><EmptyState title="No order requests here" body="New requests appear as soon as a customer prepares an order for WhatsApp." /></div>;

  return (
    <div className={cn("space-y-2.5", pending && "opacity-70")}>
      {orders.map((o) => {
        const s = STATUS_LABEL[o.status] ?? { label: o.status, tone: "gray" as const };
        const expanded = open === o.id;
        const preAck = ["LINK_GENERATED", "HANDOFF_ATTEMPTED", "MESSAGE_CONFIRMED", "VALIDATED"].includes(o.status);
        return (
          <div key={o.id} className="card overflow-hidden">
            <button onClick={() => setOpen(expanded ? null : o.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold">{o.reference}</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <Badge>{o.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}</Badge>
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-semibold">{o.customerName}</span> <span className="text-ink-muted">· {o.items.reduce((n, i) => n + i.quantity, 0)} items · {formatDateTime(o.createdAt)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="tabular font-extrabold">{formatMoney(o.subtotalCents, o.currency)}</div>
                <div className="text-xs text-ink-muted">item subtotal</div>
              </div>
              <ChevronDown className={cn("h-5 w-5 text-ink-muted transition", expanded && "rotate-180")} />
            </button>
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
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                    {o.mapsUrl && (
                      <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="chip h-8 text-xs">
                        <MapPin className="h-3.5 w-3.5" /> Map
                      </a>
                    )}
                  </div>
                  {o.address && <div>{o.address}</div>}
                  {o.notes && <div className="text-ink-muted">Note: {o.notes}</div>}
                  <div className="pt-2 text-xs text-ink-muted">
                    WhatsApp: {o.handoffAt ? `opened ${o.handoffCount}× (first ${formatDateTime(o.handoffAt)}) — opening isn't proof the message was sent` : "not opened yet"}
                  </div>
                  {o.rejectionReason && <div className="text-xs text-red-600">Rejected: {o.rejectionReason}</div>}
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
                  <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-bold">
                    <span>Subtotal</span>
                    <span className="tabular">{formatMoney(o.subtotalCents, o.currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span>Delivery fee</span>
                    <span>{o.fulfillment === "PICKUP" ? "—" : o.deliveryFeeCents != null ? formatMoney(o.deliveryFeeCents, o.currency) : "You confirm"}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-ink-muted">Commission</span>
                    <span>{o.commission ? `${formatMoney(o.commission.commissionCents)} (${formatRate(o.commission.rateBps)}) · ${o.commission.status.toLowerCase()}` : "Not billable yet"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  {preAck && (
                    <Button size="sm" onClick={() => act(o.id, "ACKNOWLEDGE")}>
                      Acknowledge (received on WhatsApp)
                    </Button>
                  )}
                  {(preAck || o.status === "ACKNOWLEDGED") && (
                    <>
                      <Button size="sm" variant="dark" onClick={() => act(o.id, "ACCEPT")}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => { setRejecting(o); setReason(""); }}>
                        Reject
                      </Button>
                    </>
                  )}
                  {(o.status === "ACCEPTED" || o.status === "ACKNOWLEDGED") && (
                    <Button size="sm" variant="secondary" onClick={() => act(o.id, "FULFILL")}>
                      Mark {o.fulfillment === "DELIVERY" ? "delivered" : "picked up"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Sheet open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.reference ?? ""}`}>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={cn("chip text-xs", reason === r && "chip-active")}>
                {r}
              </button>
            ))}
          </div>
          <textarea className="input" placeholder="Reason (shared with numnum, not the customer)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <p className="text-xs text-ink-muted">Let the customer know on WhatsApp too. High rejection rates are reviewed by our team.</p>
          <Button
            variant="danger"
            block
            disabled={!reason.trim()}
            onClick={() => {
              act(rejecting!.id, "REJECT", reason);
              setRejecting(null);
            }}
          >
            Reject order
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
