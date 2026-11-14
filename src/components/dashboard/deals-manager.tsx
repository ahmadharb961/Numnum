"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent } from "lucide-react";
import { createDealAction, endDealAction } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Section } from "@/components/dashboard/page";
import { useToast } from "@/components/ui/toast";
import { dealText, type DealKindName } from "@/lib/deals";
import { formatDate } from "@/lib/utils";
import { minorDigits } from "@/lib/money";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Row = { id: string; kind: DealKindName; percent: number | null; amountCents: number | null; minSubtotalCents: number | null; itemName: string | null; startsAt: string; endsAt: string | null; endedAt: string | null };

const KINDS: { k: DealKindName; label: string; hint: string }[] = [
  { k: "PERCENT_OFF", label: "% off", hint: "e.g. 20% off the menu or one dish" },
  { k: "AMOUNT_OFF", label: "Amount off", hint: "e.g. $5 off orders over $25" },
  { k: "FREE_DELIVERY", label: "Free delivery", hint: "optionally above a minimum order" },
];
const ENDS = [
  { k: "today", label: "End of today" },
  { k: "3d", label: "3 days" },
  { k: "7d", label: "7 days" },
  { k: "30d", label: "30 days" },
  { k: "never", label: "Until I end it" },
] as const;

export function DealsManager({ currency, items, live, ended, paused }: { currency: string; items: { id: string; name: string }[]; live: Row[]; ended: Row[]; paused: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<DealKindName>("PERCENT_OFF");
  const [percent, setPercent] = useState("20");
  const [amount, setAmount] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [endsIn, setEndsIn] = useState<(typeof ENDS)[number]["k"]>("7d");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const unit = currency === "LBP" ? "LBP" : "$";
  const decimal = minorDigits(currency) ? "decimal" : "numeric";

  const preview = (() => {
    const p = { kind, percent: Number(percent) || null, amountCents: null as number | null, minSubtotalCents: minSubtotal ? 1 : null };
    const d = dealText(p, currency, kind !== "FREE_DELIVERY" && menuItemId ? items.find((i) => i.id === menuItemId)?.name : null);
    // amounts are shown as typed
    const v = { ...d.v, ...(kind === "AMOUNT_OFF" ? { off: `${unit === "$" ? "$" : ""}${amount || "…"}${unit === "LBP" ? " LBP" : ""}` } : {}), ...(minSubtotal ? { min: `${unit === "$" ? "$" : ""}${minSubtotal}${unit === "LBP" ? " LBP" : ""}` } : {}) };
    return t(d.k, v);
  })();

  function create() {
    setError(null);
    start(async () => {
      const r = await createDealAction({ kind, percent: kind === "PERCENT_OFF" ? Number(percent) : undefined, amount: kind === "AMOUNT_OFF" ? amount : undefined, minSubtotal: minSubtotal || undefined, menuItemId: kind !== "FREE_DELIVERY" && menuItemId ? menuItemId : undefined, endsIn });
      if (!r.ok) return setError({ text: t(r.error), field: "field" in r ? r.field : undefined });
      toast(t("Deal is live"), "success");
      setAmount("");
      setMinSubtotal("");
      router.refresh();
    });
  }

  function end(id: string) {
    start(async () => {
      const r = await endDealAction(id);
      toast(r.ok ? t("Deal ended") : t(r.error), r.ok ? "success" : "error");
      router.refresh();
    });
  }

  const describe = (d: Row) => {
    const x = dealText(d, currency, d.itemName);
    return t(x.k, x.v);
  };

  return (
    <div>
      {paused && <Alert tone="amber" className="mb-4">{t("Deals are paused while an invoice is overdue. Settle it from Billing to run deals again.")}</Alert>}
      <Section title={t("New deal")}>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("Type of deal")}>
            {KINDS.map((o) => (
              <button key={o.k} type="button" role="radio" aria-checked={kind === o.k} onClick={() => setKind(o.k)} className={cn("rounded-xl border p-3 text-start transition", kind === o.k ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-black/10 bg-white")} data-testid={`deal-kind-${o.k}`}>
                <div className="text-sm font-bold">{t(o.label)}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{t(o.hint)}</div>
              </button>
            ))}
          </div>
          {kind === "PERCENT_OFF" && (
            <label className="block">
              <span className="label">{t("Percentage off")}</span>
              <div className="relative max-w-[10rem]">
                <input id="deal-percent" className="input pe-8" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-muted">%</span>
              </div>
              {error?.field === "percent" && <span className="mt-1 block text-sm text-red-600">{error.text}</span>}
            </label>
          )}
          {kind === "AMOUNT_OFF" && (
            <label className="block">
              <span className="label">{t("Amount off")}</span>
              <div className="relative max-w-[12rem]">
                <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-muted">{unit}</span>
                <input id="deal-amount" className={cn("input", unit === "LBP" ? "ps-12" : "ps-8")} inputMode={decimal} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={currency === "LBP" ? "200,000" : "5"} />
              </div>
              {error?.field === "amount" && <span className="mt-1 block text-sm text-red-600">{error.text}</span>}
            </label>
          )}
          {kind !== "FREE_DELIVERY" && (
            <label className="block">
              <span className="label">{t("On")}</span>
              <select id="deal-item" className="input" value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}>
                <option value="">{t("The whole menu")}</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="label">
              {t("Minimum order")} <span className="font-normal text-ink-muted">{t("(optional)")}</span>
            </span>
            <div className="relative max-w-[12rem]">
              <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-muted">{unit}</span>
              <input id="deal-min" className={cn("input", unit === "LBP" ? "ps-12" : "ps-8")} inputMode={decimal} value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} placeholder={currency === "LBP" ? "1,000,000" : "20"} />
            </div>
            {error?.field === "minSubtotal" && <span className="mt-1 block text-sm text-red-600">{error.text}</span>}
          </label>
          <div>
            <span className="label">{t("Runs for")}</span>
            <div className="flex flex-wrap gap-2">
              {ENDS.map((o) => (
                <button key={o.k} type="button" onClick={() => setEndsIn(o.k)} className={cn("chip", endsIn === o.k && "chip-active")} aria-pressed={endsIn === o.k}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            <BadgePercent className="h-4 w-4 shrink-0" /> {t("Customers will see: {deal}", { deal: preview })}
          </div>
          {error && !["percent", "amount", "minSubtotal"].includes(error.field ?? "") && <Alert tone="red">{error.text}</Alert>}
          <Button size="lg" onClick={create} loading={pending} disabled={paused} data-testid="deal-create">
            {t("Start deal")}
          </Button>
        </div>
      </Section>

      <Section title={t("Running")}>
        {live.length ? (
          <ul className="divide-y divide-black/5">
            {live.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3" data-testid="deal-live">
                <div className="min-w-0">
                  <div className="font-semibold">{describe(d)}</div>
                  <div className="text-xs text-ink-muted">{d.endsAt ? t("Until {date}", { date: formatDate(d.endsAt, { dateStyle: "medium", timeStyle: "short" }, locale) }) : t("Until you end it")}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => end(d.id)} disabled={pending}>
                  {t("End deal")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("No deals running")} body={t("Deals bring orders: a % off, an amount off or free delivery shows on your reels right away.")} />
        )}
      </Section>

      {ended.length > 0 && (
        <Section title={t("Ended")}>
          <ul className="divide-y divide-black/5 text-sm text-ink-muted">
            {ended.map((d) => (
              <li key={d.id} className="py-2">
                {describe(d)} · {formatDate(d.endedAt ?? d.endsAt ?? d.startsAt, { dateStyle: "medium" }, locale)}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
