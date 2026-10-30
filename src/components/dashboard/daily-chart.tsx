"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type Day = { date: string; visits: number; reelViews: number; orders: number; revenueCents: number };
const METRICS = [
  { key: "revenueCents", label: "Revenue" },
  { key: "orders", label: "Orders" },
  { key: "visits", label: "Profile visits" },
  { key: "reelViews", label: "Reel views" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Single-series daily bars (one metric at a time — never two scales on one chart), hover/tap tooltip, table view. */
export function DailyChart({ days, currency }: { days: Day[]; currency: string }) {
  const [metric, setMetric] = useState<MetricKey>("revenueCents");
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const fmt = (v: number) => (metric === "revenueCents" ? formatMoney(v, currency) : v.toLocaleString("en-US"));
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const H = 160;
  const labelEvery = Math.ceil(days.length / 6);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Metric">
          {METRICS.map((m) => (
            <button key={m.key} role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)} className={cn("chip h-8 text-xs", metric === m.key && "chip-active")}>
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={() => setTable((t) => !t)} className="text-xs font-semibold text-brand-600">
          {table ? "View chart" : "View as table"}
        </button>
      </div>
      <div className="mb-2 text-sm text-ink-muted">
        {METRICS.find((m) => m.key === metric)!.label}: <b className="tabular text-ink">{fmt(total)}</b> total
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="table-app">
            <thead>
              <tr>
                <th>Date</th>
                <th>Profile visits</th>
                <th>Reel views</th>
                <th>Orders</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{short(d.date)}</td>
                  <td className="tabular">{d.visits}</td>
                  <td className="tabular">{d.reelViews}</td>
                  <td className="tabular">{d.orders}</td>
                  <td className="tabular">{formatMoney(d.revenueCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <div className="flex items-end border-b border-black/10" style={{ height: H, gap: 2 }} role="img" aria-label={`Daily ${METRICS.find((m) => m.key === metric)!.label.toLowerCase()}`}>
            {days.map((d, i) => {
              const v = d[metric];
              const h = v ? Math.max(3, (v / max) * (H - 8)) : 0;
              return (
                <button
                  key={d.date}
                  className="relative flex h-full min-w-0 flex-1 items-end focus:outline-none"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onClick={() => setHover(i)}
                  aria-label={`${short(d.date)}: ${fmt(v)}`}
                >
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
            <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}>
              <div className="font-semibold">{short(days[hover].date)}</div>
              <div className="tabular">{fmt(days[hover][metric])}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
