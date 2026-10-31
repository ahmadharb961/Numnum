"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { api } from "./track";
import { useT } from "@/i18n/client";

type Pending = { reference: string; fulfillment: "DELIVERY" | "PICKUP"; restaurant: { id: string; displayName: string; logoUrl: string | null }; items: { menuItemId: string; name: string; imageUrl: string | null }[] };

function Stars({ value, onChange, size = 30, label }: { value: number; onChange: (v: number) => void; size?: number; label: string }) {
  const t = useT();
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={t(label)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={t(i > 1 ? "{n} stars" : "{n} star", { n: i })} onClick={() => onChange(i)} className="p-0.5 active:scale-90">
          <Star style={{ width: size, height: size }} className={cn(i <= value ? "fill-amber-400 text-amber-400" : "text-black/15")} />
        </button>
      ))}
    </div>
  );
}

/**
 * After an order is delivered, asks the customer to rate each dish and the restaurant.
 * Checked on every page change; "Not now" stops asking for that order.
 */
export function ReviewPrompt() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState<Pending | null>(null);
  const [items, setItems] = useState<Record<string, number>>({});
  const [rest, setRest] = useState(0);
  const [sub, setSub] = useState({ foodQuality: 0, service: 0, value: 0, delivery: 0 });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/checkout")) return;
    fetch("/api/account/pending-review")
      .then((r) => r.json())
      .then((d) => setP((cur) => (cur?.reference === d.pending?.reference ? cur : d.pending)))
      .catch(() => {});
  }, [pathname]);

  if (!p) return null;
  const close = async (dismiss: boolean) => {
    const ref = p.reference;
    setP(null);
    if (dismiss) await api(`/api/orders/${ref}/review`, { dismiss: true }).catch(() => {});
  };

  async function submit() {
    setBusy(true);
    try {
      const s = (v: number) => (v ? v : null);
      await api(`/api/orders/${p!.reference}/review`, {
        restaurant: rest ? { rating: rest, foodQuality: s(sub.foodQuality), service: s(sub.service), value: s(sub.value), delivery: p!.fulfillment === "DELIVERY" ? s(sub.delivery) : null, body: body.trim() || null } : null,
        items: Object.entries(items).filter(([, v]) => v > 0).map(([menuItemId, rating]) => ({ menuItemId, rating })),
      });
      toast("Thanks for rating! 🙏", "success");
      setP(null);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const anyRating = rest > 0 || Object.values(items).some((v) => v > 0);
  return (
    <Sheet open onClose={() => close(true)} title="How was your order?">
      <div className="space-y-5 p-5">
        <section>
          <div className="mb-2 flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-xl bg-brand-50">
              {p.restaurant.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.restaurant.logoUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div>
              <div className="font-bold">{p.restaurant.displayName}</div>
              <div className="text-xs text-ink-muted">{t("Rate the overall experience")}</div>
            </div>
          </div>
          <Stars value={rest} onChange={setRest} size={36} label={`Rate ${p.restaurant.displayName}`} />
          {rest > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {(
                [
                  ["foodQuality", "Food"],
                  ["service", "Service"],
                  ["value", "Value"],
                  ...(p.fulfillment === "DELIVERY" ? ([["delivery", "Delivery"]] as const) : []),
                ] as const
              ).map(([k, l]) => (
                <div key={k}>
                  <div className="mb-0.5 font-semibold text-ink-muted">{t(l)}</div>
                  <Stars value={sub[k]} onChange={(v) => setSub({ ...sub, [k]: v })} size={20} label={t("Rate {what}", { what: t(l) })} />
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="space-y-3">
          <div className="text-sm font-bold">{t("Rate the dishes")}</div>
          {p.items.map((i) => (
            <div key={i.menuItemId} className="flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black/5">
                {i.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.imageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{i.name}</div>
                <Stars value={items[i.menuItemId] ?? 0} onChange={(v) => setItems({ ...items, [i.menuItemId]: v })} size={24} label={`Rate ${i.name}`} />
              </div>
            </div>
          ))}
        </section>
        {anyRating && <textarea className="input" maxLength={1500} placeholder={t("Tell others what you loved (optional)")} value={body} onChange={(e) => setBody(e.target.value)} />}
        <div className="grid grid-cols-3 gap-3">
          <Button variant="ghost" onClick={() => close(true)}>
            {t("Not now")}
          </Button>
          <Button className="col-span-2" size="lg" disabled={!anyRating} loading={busy} onClick={submit}>
            {t("Submit rating")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
