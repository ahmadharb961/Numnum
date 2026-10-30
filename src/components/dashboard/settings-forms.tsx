"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ImagePlus, LocateFixed, Plus, Trash2 } from "lucide-react";
import { saveHoursAction, saveOrderingAction, saveProfileAction } from "@/actions/restaurant";
import type { FormState } from "@/actions/auth";
import { uploadFile } from "./upload";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { DAYS, DAY_LABELS, type OpeningHours } from "@/lib/hours";

function ImageField({ name, label, initial, aspect }: { name: string; label: string; initial: string; aspect: string }) {
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  return (
    <div>
      <div className="label">{label}</div>
      <input type="hidden" name={name} value={url} />
      <button type="button" onClick={() => ref.current?.click()} className={`relative grid w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-black/15 bg-white ${aspect}`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs font-semibold text-ink-muted">
            <ImagePlus className="h-6 w-6" />
            {busy ? "Uploading…" : "Upload"}
          </span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            const up = await uploadFile(f, "image");
            setUrl(up.url ?? "");
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function ProfileForm({ r }: { r: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const [lat, setLat] = useState(r.latitude);
  const [lng, setLng] = useState(r.longitude);
  return (
    <form action={action} className="space-y-4">
      {state?.ok && <Alert tone="green">{state.message}</Alert>}
      <div className="grid grid-cols-[120px_1fr] gap-4">
        <ImageField name="logoUrl" label="Logo" initial={r.logoUrl} aspect="aspect-square" />
        <ImageField name="coverUrl" label="Cover photo" initial={r.coverUrl} aspect="aspect-[3/1] h-[120px]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Restaurant name" error={fe.displayName}>
          <input name="displayName" className="input" defaultValue={r.displayName} required />
        </Field>
        <Field label="Legal business name" error={fe.businessName}>
          <input name="businessName" className="input" defaultValue={r.businessName} required />
        </Field>
        <Field label="Cuisine">
          <input name="cuisine" className="input" defaultValue={r.cuisine} placeholder="Lebanese, Grills" />
        </Field>
        <Field label="Restaurant phone (customers call this about orders)" error={fe.phone}>
          <input name="phone" className="input" type="tel" defaultValue={r.phone} />
        </Field>
        <Field label="Email (billing notifications)" error={fe.email}>
          <input name="email" className="input" type="email" defaultValue={r.email} />
        </Field>
        <Field label="Area / neighborhood">
          <input name="area" className="input" defaultValue={r.area} placeholder="Hamra" />
        </Field>
        <Field label="City">
          <input name="city" className="input" defaultValue={r.city} placeholder="Beirut" />
        </Field>
        <Field label="Street address">
          <input name="address" className="input" defaultValue={r.address} />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" className="input" maxLength={600} defaultValue={r.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Google Maps link" error={fe.mapsUrl}>
          <input name="mapsUrl" className="input" defaultValue={r.mapsUrl} placeholder="https://maps.app.goo.gl/…" />
        </Field>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition((p) => {
                setLat(p.coords.latitude.toFixed(6));
                setLng(p.coords.longitude.toFixed(6));
              })
            }
          >
            <LocateFixed className="h-4 w-4" /> Use current location
          </Button>
        </div>
      </div>
      <input type="hidden" name="latitude" value={lat} />
      <input type="hidden" name="longitude" value={lng} />
      {lat && <p className="text-xs text-ink-muted">Pinned at {lat}, {lng}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["instagram", "facebook", "tiktok", "website"] as const).map((k) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)} error={fe[k]}>
            <input name={k} className="input" defaultValue={r[k] ?? ""} placeholder="https://" />
          </Field>
        ))}
      </div>
      <Button type="submit" loading={pending}>
        Save details
      </Button>
    </form>
  );
}

export function OrderingForm({ r, currencies, agreementAccepted }: { r: { avgPrepMinutes: string; deliveryEnabled: boolean; pickupEnabled: boolean; requireMapsLocation: boolean; deliveryFee: string; minOrder: string; currency: string; orderingEnabled: boolean; areas: string }; currencies: string[]; agreementAccepted: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOrderingAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.ok && <Alert tone="green">{state.message}</Alert>}
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <label className="flex items-center gap-3 rounded-xl bg-cream p-3 text-sm font-semibold">
        <input type="checkbox" name="orderingEnabled" defaultChecked={r.orderingEnabled} disabled={!agreementAccepted} className="h-5 w-5 accent-brand-500" />
        Accepting orders (turn off to pause ordering, e.g. when you&apos;re too busy)
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Average preparation time (minutes)" error={fe.avgPrepMinutes} hint="Suggested when you accept an order; customers see it at checkout">
          <input name="avgPrepMinutes" type="number" min={5} max={180} className="input" defaultValue={r.avgPrepMinutes} required />
        </Field>
        <Field label="Menu currency" error={fe.currency}>
          <select name="currency" className="input" defaultValue={r.currency}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="deliveryEnabled" defaultChecked={r.deliveryEnabled} className="h-5 w-5 accent-brand-500" /> Delivery
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pickupEnabled" defaultChecked={r.pickupEnabled} className="h-5 w-5 accent-brand-500" /> Pickup
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requireMapsLocation" defaultChecked={r.requireMapsLocation} className="h-5 w-5 accent-brand-500" /> Require Google Maps location for delivery
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Delivery fee (${r.currency})`} error={fe.deliveryFee} hint="Shown to customers at checkout. Enter 0 for free delivery.">
          <input name="deliveryFee" className="input" inputMode="decimal" defaultValue={r.deliveryFee} />
        </Field>
        <Field label={`Minimum order (${r.currency}, optional)`} error={fe.minOrder}>
          <input name="minOrder" className="input" inputMode="decimal" defaultValue={r.minOrder} />
        </Field>
      </div>
      <Field label="Delivery areas (optional, one per line with its fee)" hint="e.g. “Hamra: 2.00”. When areas are listed, you only deliver to them; areas without a fee use the delivery fee above.">
        <textarea name="areas" className="input font-mono text-sm" rows={5} defaultValue={r.areas} placeholder={"Hamra: 2.00\nAchrafieh: 3.00\nVerdun"} />
      </Field>
      <Button type="submit" loading={pending}>
        Save ordering settings
      </Button>
    </form>
  );
}

export function HoursEditor({ initial }: { initial: OpeningHours }) {
  const [hours, setHours] = useState<OpeningHours>(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  const set = (d: (typeof DAYS)[number], slots: { open: string; close: string }[]) => setHours({ ...hours, [d]: slots });
  return (
    <div className="space-y-2">
      {DAYS.map((d) => {
        const slots = hours[d] ?? [];
        return (
          <div key={d} className="flex flex-wrap items-center gap-2 border-b border-black/5 py-2">
            <span className="w-28 text-sm font-semibold">{DAY_LABELS[d]}</span>
            {slots.length === 0 && <span className="text-sm text-ink-muted">Closed</span>}
            {slots.map((s, i) => (
              <span key={i} className="flex items-center gap-1">
                <input type="time" className="input h-9 w-28 text-sm" value={s.open} onChange={(e) => set(d, slots.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} />
                –
                <input type="time" className="input h-9 w-28 text-sm" value={s.close} onChange={(e) => set(d, slots.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} />
                <button type="button" onClick={() => set(d, slots.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center text-ink-muted" aria-label="Remove time slot">
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            ))}
            {slots.length < 3 && (
              <button type="button" onClick={() => set(d, [...slots, { open: "11:00", close: "23:00" }])} className="chip h-8 text-xs">
                <Plus className="h-3.5 w-3.5" /> Hours
              </button>
            )}
          </div>
        );
      })}
      <div className="flex gap-2 pt-2">
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await saveHoursAction(hours);
              toast(r.ok ? r.message ?? "Saved" : r.error, r.ok ? "success" : "error");
            })
          }
        >
          Save hours
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const mon = hours.mon ?? [{ open: "11:00", close: "23:00" }];
            setHours(Object.fromEntries(DAYS.map((d) => [d, mon])) as OpeningHours);
          }}
        >
          Copy Monday to all days
        </Button>
      </div>
    </div>
  );
}
