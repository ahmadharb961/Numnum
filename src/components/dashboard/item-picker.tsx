"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function ItemPicker({ items, value, onChange }: { items: { id: string; label: string; sku: string }[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => items.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase())).slice(0, 100), [items, q]);
  return (
    <div className="rounded-xl border border-black/10 bg-white">
      <label className="relative block border-b border-black/5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input className="h-11 w-full rounded-t-xl bg-transparent pl-9 pr-3 text-[16px] outline-none" placeholder="Search your menu" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul className="max-h-60 overflow-auto">
        {list.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onChange(i.id)} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm", value === i.id ? "bg-brand-50 font-semibold" : "hover:bg-black/[0.02]")}>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2", value === i.id ? "border-brand-500 bg-brand-500 text-white" : "border-black/20")}>{value === i.id && <Check className="h-3 w-3" />}</span>
              <span className="flex-1">{i.label}</span>
              <span className="font-mono text-[11px] text-ink-muted">{i.sku}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="p-4 text-center text-sm text-ink-muted">No items found</li>}
      </ul>
    </div>
  );
}
