"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkCommissionAction } from "@/actions/admin";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Row = { id: string; displayName: string; place: string; status: string; verificationStatus: string; commissionRateBps: number | null; items: number; reels: number; orders: number; views: string; joined: string };

/** Restaurants with a commission column; select any number and give them one rate (or the default). */
export function RestaurantTable({ rows, defaultRate }: { rows: Row[]; defaultRate: number }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rate, setRate] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const apply = (value: string | null) =>
    start(async () => {
      const r = await bulkCommissionAction([...sel], value);
      if (r.ok) {
        const n = r.data?.changed ?? 0;
        toast(`${n} restaurant${n === 1 ? "" : "s"} updated`, "success");
        setSel(new Set());
        setRate("");
        router.refresh();
      } else toast(r.error, "error");
    });

  return (
    <>
      {sel.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink p-3 text-sm text-white shadow-lg">
          <b>{sel.size} selected</b>
          <span className="text-white/60">· Commission:</span>
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="e.g. 10" className="h-9 w-24 rounded-lg bg-white px-3 text-ink" aria-label="Commission rate %" />
          <span>%</span>
          <Button size="sm" loading={pending} disabled={rate.trim() === ""} onClick={() => apply(rate)}>
            Set rate
          </Button>
          <Button size="sm" variant="ghost" className="border border-white/30 !text-white hover:!bg-white/10" loading={pending} onClick={() => apply(null)}>
            Use default ({defaultRate}%)
          </Button>
          <button type="button" onClick={() => setSel(new Set())} className="ms-auto text-white/70 hover:text-white">
            Clear
          </button>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="table-app">
          <thead>
            <tr>
              <th className="w-8">
                <input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="h-4 w-4 accent-brand-500" aria-label="Select all" />
              </th>
              <th>Restaurant</th>
              <th>Status</th>
              <th>Verification</th>
              <th>Commission</th>
              <th>Items</th>
              <th>Reels</th>
              <th>Orders</th>
              <th>Views</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn(sel.has(r.id) && "bg-brand-50/60")}>
                <td>
                  <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-brand-500" aria-label={`Select ${r.displayName}`} />
                </td>
                <td>
                  <Link href={`/admin/restaurants/${r.id}`} className="font-semibold text-brand-600">
                    {r.displayName}
                  </Link>
                  <div className="text-xs text-ink-muted">{r.place}</div>
                </td>
                <td>
                  <Badge tone={r.status === "ACTIVE" ? "green" : r.status === "PENDING_APPROVAL" ? "amber" : r.status === "SUSPENDED" ? "red" : "gray"}>{r.status.toLowerCase().replace("_", " ")}</Badge>
                </td>
                <td>
                  <Badge tone={r.verificationStatus === "APPROVED" ? "blue" : r.verificationStatus === "PENDING" ? "amber" : "gray"}>{r.verificationStatus.toLowerCase().replace("_", " ")}</Badge>
                </td>
                <td className="whitespace-nowrap">
                  {r.commissionRateBps === null ? <span className="text-ink-muted">{defaultRate}% (default)</span> : <b className="text-brand-700">{r.commissionRateBps / 100}%</b>}
                </td>
                <td>{r.items}</td>
                <td>{r.reels}</td>
                <td>{r.orders}</td>
                <td>{r.views}</td>
                <td className="whitespace-nowrap">{r.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
