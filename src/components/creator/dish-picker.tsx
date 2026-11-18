"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Store, X } from "lucide-react";
import { searchDishesAction } from "@/actions/creators";
import { formatMoney } from "@/lib/money";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type PickedDish = { id: string; name: string; priceCents: number; currency: string; restaurant: string; area: string | null; logoUrl: string | null; imageUrl: string | null; own?: boolean };

/** Search a dish by its name or the restaurant's, then pick the exact dish shown in the reel. */
export function DishPicker({ value, onChange, error }: { value: PickedDish | null; onChange: (d: PickedDish | null) => void; error?: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedDish[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults([]);
    const n = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const r = await searchDishesAction(term).catch(() => []);
      if (n === seq.current) {
        setResults(r);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  if (value)
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3" data-testid="picked-dish">
        <Thumb d={value} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{value.name}</div>
          <div className="truncate text-sm text-ink-muted">
            {value.restaurant} · {formatMoney(value.priceCents, value.currency)}
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5" aria-label={t("Change")}>
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  return (
    <div>
      <span className="relative block">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search a dish or a restaurant")} className="input ps-9" data-testid="dish-search" />
      </span>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{t(error)}</p>}
      {q.trim().length >= 2 && (
        <ul className="mt-2 max-h-72 divide-y divide-black/5 overflow-y-auto rounded-2xl border border-black/5 bg-white">
          {results.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => !d.own && onChange(d)} disabled={d.own} className={cn("flex w-full items-center gap-3 p-3 text-start", d.own ? "cursor-not-allowed opacity-60" : "hover:bg-black/[0.03]")} data-testid="dish-result" data-own={d.own ? "" : undefined}>
                <Thumb d={d} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {d.restaurant}
                    {d.area ? ` · ${d.area}` : ""}
                  </span>
                  {d.own && <span className="mt-0.5 block text-xs font-semibold text-brand-600">{t("Your restaurant: post it from your dashboard")}</span>}
                </span>
                <span className="tabular text-sm font-semibold">{formatMoney(d.priceCents, d.currency)}</span>
              </button>
            </li>
          ))}
          {!loading && !results.length && <li className="p-4 text-center text-sm text-ink-muted">{t("No dishes found")}</li>}
          {loading && !results.length && <li className="p-4 text-center text-sm text-ink-muted">{t("Searching…")}</li>}
        </ul>
      )}
    </div>
  );
}

function Thumb({ d }: { d: PickedDish }) {
  const src = d.imageUrl ?? d.logoUrl;
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50 text-brand-500">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Store className="h-5 w-5" />
      )}
    </span>
  );
}
