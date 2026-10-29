"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import { deleteGroupAction, saveGroupAction } from "@/actions/menu";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Field } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Option = { id?: string; name: string; price: string; available: boolean; isDefault: boolean };
type Group = { id?: string; name: string; type: "SINGLE" | "MULTIPLE" | "TEXT"; required: boolean; minSelect: number; maxSelect: number; options: Option[]; usedBy?: string[] };

const TEMPLATES: { label: string; group: Group }[] = [
  { label: "Size", group: { name: "Size", type: "SINGLE", required: true, minSelect: 1, maxSelect: 1, options: [{ name: "Regular", price: "0", available: true, isDefault: true }, { name: "Large", price: "1.50", available: true, isDefault: false }] } },
  { label: "Extra toppings", group: { name: "Extra toppings", type: "MULTIPLE", required: false, minSelect: 0, maxSelect: 5, options: [{ name: "Extra cheese", price: "1.00", available: true, isDefault: false }, { name: "Bacon", price: "1.50", available: true, isDefault: false }] } },
  { label: "Remove ingredients", group: { name: "Remove ingredients", type: "MULTIPLE", required: false, minSelect: 0, maxSelect: 0, options: [{ name: "No onions", price: "0", available: true, isDefault: false }, { name: "No pickles", price: "0", available: true, isDefault: false }] } },
  { label: "Cooking preference", group: { name: "Cooking preference", type: "SINGLE", required: true, minSelect: 1, maxSelect: 1, options: [{ name: "Medium", price: "0", available: true, isDefault: true }, { name: "Well done", price: "0", available: true, isDefault: false }] } },
  { label: "Special instructions", group: { name: "Special instructions", type: "TEXT", required: false, minSelect: 0, maxSelect: 0, options: [] } },
];

export function CustomizationManager({ groups, currency }: { groups: Group[]; currency: string }) {
  const [editing, setEditing] = useState<Group | null>(null);
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing({ name: "", type: "SINGLE", required: false, minSelect: 0, maxSelect: 1, options: [{ name: "", price: "0", available: true, isDefault: false }] })}>
          <Plus className="h-4 w-4" /> New group
        </Button>
        {TEMPLATES.map((t) => (
          <button key={t.label} onClick={() => setEditing(structuredClone(t.group))} className="chip h-9 text-xs">
            + {t.label}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <div className="card">
          <EmptyState title="No customization groups yet" body="Start from a template above, e.g. Size or Extra toppings." />
        </div>
      ) : (
        <div className={cn("grid gap-3 md:grid-cols-2", pending && "opacity-60")}>
          {groups.map((g) => (
            <div key={g.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{g.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>{g.type === "SINGLE" ? "Single choice" : g.type === "MULTIPLE" ? `Multiple${g.maxSelect ? ` · max ${g.maxSelect}` : ""}` : "Free text"}</Badge>
                    <Badge tone={g.required ? "brand" : "gray"}>{g.required ? "Required" : "Optional"}</Badge>
                  </div>
                </div>
                <div className="flex">
                  <button onClick={() => setEditing(structuredClone(g))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5" aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      confirm(`Delete “${g.name}”? It will be removed from ${g.usedBy?.length ?? 0} item(s).`) &&
                      start(async () => {
                        await deleteGroupAction(g.id!);
                        router.refresh();
                      })
                    }
                    className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {g.options.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {g.options.map((o) => (
                    <li key={o.id} className={cn("flex justify-between", !o.available && "text-ink-muted line-through")}>
                      <span>
                        {o.name}
                        {o.isDefault && <span className="ml-1 text-xs text-ink-muted">(default)</span>}
                      </span>
                      <span className="tabular text-ink-muted">{Number(o.price) === 0 ? "—" : `${Number(o.price) > 0 ? "+" : ""}${o.price} ${currency}`}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-muted">{g.usedBy?.length ? `Used by: ${g.usedBy.slice(0, 4).join(", ")}${g.usedBy.length > 4 ? ` +${g.usedBy.length - 4}` : ""}` : "Not attached to any item yet"}</p>
            </div>
          ))}
        </div>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit customization" : "New customization"}>
        {editing && (
          <GroupEditor
            initial={editing}
            currency={currency}
            onSaved={() => {
              setEditing(null);
              toast("Saved", "success");
              router.refresh();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function GroupEditor({ initial, currency, onSaved }: { initial: Group; currency: string; onSaved: () => void }) {
  const [g, setG] = useState<Group>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setOpt = (i: number, patch: Partial<Option>) => setG({ ...g, options: g.options.map((o, j) => (j === i ? { ...o, ...patch } : g.type === "SINGLE" && patch.isDefault ? { ...o, isDefault: false } : o)) });
  const move = (i: number, d: number) => {
    const opts = [...g.options];
    const j = i + d;
    if (j < 0 || j >= opts.length) return;
    [opts[i], opts[j]] = [opts[j], opts[i]];
    setG({ ...g, options: opts });
  };
  return (
    <form
      className="space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await saveGroupAction({ ...g, options: g.options.filter((o) => o.name.trim()) });
        setBusy(false);
        if (res.ok) onSaved();
        else setError(res.error);
      }}
    >
      <Field label="Group name">
        <input className="input" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="e.g. Choose your sauce" required />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        {(["SINGLE", "MULTIPLE", "TEXT"] as const).map((t) => (
          <button type="button" key={t} onClick={() => setG({ ...g, type: t, maxSelect: t === "SINGLE" ? 1 : g.maxSelect })} className={cn("rounded-xl border-2 px-2 py-2.5 text-xs font-bold", g.type === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-black/10")}>
            {t === "SINGLE" ? "Single choice" : t === "MULTIPLE" ? "Multiple choice" : "Free text"}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" checked={g.required} onChange={(e) => setG({ ...g, required: e.target.checked, minSelect: e.target.checked ? Math.max(1, g.minSelect) : 0 })} className="h-5 w-5 accent-brand-500" />
        Customer must choose (required)
      </label>
      {g.type === "MULTIPLE" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum selections">
            <input type="number" min={0} className="input" value={g.minSelect} onChange={(e) => setG({ ...g, minSelect: Number(e.target.value) })} />
          </Field>
          <Field label="Maximum (0 = no limit)">
            <input type="number" min={0} className="input" value={g.maxSelect} onChange={(e) => setG({ ...g, maxSelect: Number(e.target.value) })} />
          </Field>
        </div>
      )}
      {g.type !== "TEXT" && (
        <div>
          <div className="label">Options</div>
          <div className="space-y-2">
            {g.options.map((o, i) => (
              <div key={i} className="rounded-xl border border-black/10 p-2">
                <div className="flex gap-2">
                  <input className="input h-10 flex-1 text-sm" placeholder="Option name" value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} />
                  <input className="input h-10 w-24 text-sm" inputMode="decimal" placeholder="+0.00" value={o.price} onChange={(e) => setOpt(i, { price: e.target.value })} aria-label={`Price adjustment in ${currency}`} />
                </div>
                <div className="mt-1.5 flex items-center gap-3 px-1 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={o.available} onChange={(e) => setOpt(i, { available: e.target.checked })} className="accent-brand-500" /> Available
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={o.isDefault} onChange={(e) => setOpt(i, { isDefault: e.target.checked })} className="accent-brand-500" /> Pre-selected
                  </label>
                  <span className="flex-1" />
                  <button type="button" onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setG({ ...g, options: g.options.filter((_, j) => j !== i) })} className="text-red-600" aria-label="Remove option">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setG({ ...g, options: [...g.options, { name: "", price: "0", available: true, isDefault: false }] })} className="mt-2 text-sm font-semibold text-brand-600">
            + Add option
          </button>
          <p className="mt-1 text-xs text-ink-muted">Price adjustments can be positive, zero, or negative (e.g. -1.00 for “no meat”).</p>
        </div>
      )}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <Button type="submit" block size="lg" loading={busy}>
        Save
      </Button>
    </form>
  );
}
