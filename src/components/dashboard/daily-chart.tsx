"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useT } from "@/i18n/client";

export type ChartMetric = { key: string; label: string; money?: boolean };
type Day = { date: string } & Record<string, number | string>;

const DEFAULT_METRICS: ChartMetric[] = [
  { key: "revenueCents", label: "Revenue", money: true },
  { key: "orders", label: "Orders" },
  { key: "visits", label: "Profile visits" },
  { key: "reelViews", label: "Reel views" },
];

const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Single-series daily bars (one metric at a time — never two scales on one chart), hover/tap tooltip, table view. */
export function DailyChart({ days, currency, metrics = DEFAULT_METRICS }: { days: Day[]; currency: string; metrics?: ChartMetric[] }) {
  const t = useT();
  const [key, setKey] = useState(metrics[0].key);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const metric = metrics.find((m) => m.key === key)!;
  const fmtFor = (m: ChartMetric, v: number) => (m.money ? formatMoney(v, currency) : v.toLocaleString("en-US"));
  const values = days.map((d) => Number(d[key]) || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const H = 160;
  const labelEvery = Math.ceil(days.length / 6);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("Metric")}>
          {metrics.map((m) => (
            <button key={m.key} role="tab" aria-selected={key === m.key} onClick={() => setKey(m.key)} className={cn("chip h-8 text-xs", key === m.key && "chip-active")}>
              {t(m.label)}
            </button>
          ))}
        </div>
        <button onClick={() => setTable((t) => !t)} className="text-xs font-semibold text-brand-600">
          {table ? t("View chart") : t("View as table")}
        </button>
      </div>
      <div className="mb-2 text-sm text-ink-muted">
        {t(metric.label)}: <b className="tabular text-ink">{fmtFor(metric, total)}</b> {t("total")}
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="table-app">
            <thead>
              <tr>
                <th>{t("Date")}</th>
                {metrics.map((m) => (
                  <th key={m.key}>{t(m.label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{short(d.date)}</td>
                  {metrics.map((m) => (
                    <td key={m.key} className="tabular">
                      {fmtFor(m, Number(d[m.key]) || 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" dir="ltr" onMouseLeave={() => setHover(null)}>
          <div className="flex items-end border-b border-black/10" style={{ height: H, gap: 2 }} role="img" aria-label={t("Daily {metric}", { metric: t(metric.label).toLowerCase() })}>
            {days.map((d, i) => {
              const v = Number(d[key]) || 0;
              const h = v ? Math.max(3, (v / max) * (H - 8)) : 0;
              return (
                <button key={d.date} className="relative flex h-full min-w-0 flex-1 items-end focus:outline-none" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} aria-label={`${short(d.date)}: ${fmtFor(metric, v)}`}>
                  <span className={cn("block w-full rounded-t-[4px] transition-colors", hover === i ? "bg-brand-600" : "bg-brand-500")} style={{ height: h }} />
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex text-[10px] text-ink-muted" style={{ gap: 2 }}>
            {days.map((d, i) => (
              <span key={d.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                {i % labelEvery === 0 ? short(d.date) : ""}
              </span>
            ))}
          </div>
          {hover !== null && (
            <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `${Math.min(90, Math.max(10, ((hover + 0.5) / days.length) * 100))}%` }}>
              <div className="font-semibold">{short(days[hover].date)}</div>
              <div className="tabular">{fmtFor(metric, Number(days[hover][key]) || 0)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
