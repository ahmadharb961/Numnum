"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { MapPicker } from "@/components/map-picker";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Field } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Addr = { id?: string; label: string; area: string; address: string; building: string; notes: string; mapsUrl: string; latitude: number | null; longitude: number | null; isDefault: boolean };
const EMPTY: Addr = { label: "", area: "", address: "", building: "", notes: "", mapsUrl: "", latitude: null, longitude: null, isDefault: false };

export function AddressBook({ addresses }: { addresses: Addr[] }) {
  const [edit, setEdit] = useState<Addr | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Failed", "error");
      else if (r.message) toast(r.message, "success");
      router.refresh();
    });
  return (
    <div className="space-y-3">
      {!addresses.length && <EmptyState icon={<MapPin />} title="No saved addresses" body="Save your home or work address for faster checkout." />}
      {addresses.map((a) => (
        <div key={a.id} className="card p-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-brand-500" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-center gap-2 font-bold">
                {a.label} {a.isDefault && <Badge tone="brand">Default</Badge>}
              </div>
              <div className="text-ink-soft">{[a.area, a.address, a.building].filter(Boolean).join(", ")}</div>
              {a.notes && <div className="text-xs text-ink-muted">{a.notes}</div>}
              {a.latitude != null ? <div className="text-xs text-emerald-700">📍 Pinned on the map</div> : <div className="text-xs font-semibold text-amber-700">Add a map pin to use this address for delivery</div>}
            </div>
          </div>
          <div className="mt-3 flex gap-4 text-xs font-semibold">
            <button className="inline-flex items-center gap-1 text-brand-600" onClick={() => setEdit(a)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            {!a.isDefault && (
              <button className="inline-flex items-center gap-1 text-ink-muted" disabled={pending} onClick={() => run(() => setDefaultAddressAction(a.id!))}>
                <Star className="h-3.5 w-3.5" /> Make default
              </button>
            )}
            <button className="inline-flex items-center gap-1 text-red-600" disabled={pending} onClick={() => confirm("Delete this address?") && run(() => deleteAddressAction(a.id!))}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      ))}
      <Button block variant="outline" onClick={() => setEdit({ ...EMPTY })}>
        <Plus className="h-4 w-4" /> Add an address
      </Button>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit address" : "New address"}>
        {edit && (
          <AddressForm
            initial={edit}
            onSaved={() => {
              setEdit(null);
              router.refresh();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function AddressForm({ initial, onSaved }: { initial: Addr; onSaved: () => void }) {
  const [a, setA] = useState<Addr>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <form
      className="space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await saveAddressAction({ ...a, mapsUrl: undefined });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        toast("Address saved", "success");
        onSaved();
      }}
    >
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {["Home", "Work", "Family"].map((l) => (
          <button key={l} type="button" onClick={() => setA({ ...a, label: l })} className={`chip h-8 text-xs ${a.label === l ? "chip-active" : ""}`}>
            {l}
          </button>
        ))}
      </div>
      <Field label="Label">
        <input className="input" value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })} placeholder="Home" />
      </Field>
      <Field label="Area">
        <input className="input" value={a.area} onChange={(e) => setA({ ...a, area: e.target.value })} placeholder="Hamra" />
      </Field>
      <Field label="Street address">
        <textarea className="input min-h-[72px]" value={a.address} onChange={(e) => setA({ ...a, address: e.target.value })} />
      </Field>
      <Field label="Building & floor">
        <input className="input" value={a.building} onChange={(e) => setA({ ...a, building: e.target.value })} />
      </Field>
      <Field label="Notes for the driver">
        <input className="input" value={a.notes} onChange={(e) => setA({ ...a, notes: e.target.value })} />
      </Field>
      <div>
        <div className="label">
          Exact location <span className="text-brand-600">(required)</span>
        </div>
        <MapPicker value={a.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : null} onChange={(p) => setA({ ...a, latitude: p.lat, longitude: p.lng })} autoLocate={a.latitude == null} height={240} />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={a.isDefault} onChange={(e) => setA({ ...a, isDefault: e.target.checked })} className="h-5 w-5 accent-brand-500" /> Use as default address
      </label>
      <Button type="submit" block size="lg" loading={busy}>
        Save address
      </Button>
    </form>
  );
}
