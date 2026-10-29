"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoicesAction, previewInvoicesAction, runMaintenanceAction } from "@/actions/admin";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

type Row = { restaurantId: string; name: string; orders: number; subtotalCents: number; commissionCents: number; adjustmentsCents: number; totalCents: number; existing: string | null };

export function InvoiceGenerator({ defaultPeriod }: { defaultPeriod: string }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="label">Billing period</span>
          <input className="input h-10 w-36" value={period} onChange={(e) => setPeriod(e.target.value)} pattern="\d{4}-\d{2}" />
        </label>
        <Button
          variant="outline"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await previewInvoicesAction(period);
              if (r.ok) setRows(r.data ?? []);
              else setMsg({ ok: false, text: r.error });
            })
          }
        >
          Preview
        </Button>
        <Button
          loading={pending}
          onClick={() => {
            if (!confirm(`Generate and issue invoices for ${period}? Issued invoices can only be changed via adjustments.`)) return;
            start(async () => {
              const r = await generateInvoicesAction(period);
              if (r.ok) {
                const created = (r.data ?? []).filter((x) => x.created).length;
                const errors = (r.data ?? []).filter((x) => "error" in x && x.error);
                setMsg({ ok: !errors.length, text: `${created} invoice(s) issued.${errors.length ? ` ${errors.length} failed.` : ""}` });
                setRows(null);
                router.refresh();
              } else setMsg({ ok: false, text: r.error });
            });
          }}
        >
          Generate invoices
        </Button>
        <Button
          variant="ghost"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await runMaintenanceAction();
              setMsg(r.ok ? { ok: true, text: `Refreshed ${r.data?.refreshed} invoices · ${r.data?.reminders} reminders sent · ${r.data?.restricted} restrictions applied` } : { ok: false, text: r.error });
              router.refresh();
            })
          }
        >
          Run reminders & overdue check
        </Button>
      </div>
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      {rows && (
        <div className="overflow-x-auto">
          {rows.length ? (
            <table className="table-app">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Orders</th>
                  <th>Subtotal</th>
                  <th>Commission</th>
                  <th>Adjustments</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.restaurantId}>
                    <td>{r.name}</td>
                    <td>{r.orders}</td>
                    <td>{formatMoney(r.subtotalCents)}</td>
                    <td>{formatMoney(r.commissionCents)}</td>
                    <td>{formatMoney(r.adjustmentsCents)}</td>
                    <td className="font-bold">{formatMoney(Math.max(0, r.totalCents))}</td>
                    <td className="text-xs text-ink-muted">{r.existing ? `Already invoiced (${r.existing})` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-muted">Nothing to invoice for this period.</p>
          )}
        </div>
      )}
    </div>
  );
}
