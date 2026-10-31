"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { saveHoursAction, saveOrderingAction, saveProfileAction } from "@/actions/restaurant";
import type { FormState } from "@/actions/auth";
import { uploadFile } from "./upload";
import { MapPicker, type Pin } from "@/components/map-picker";
import { MAX_ZONE_KM } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { FramedCropper } from "./framed-cropper";
import { DAYS, DAY_LABELS, type OpeningHours } from "@/lib/hours";
import { useT } from "@/i18n/client";

type Crop = { aspect: number; outputWidth: number; title: string; guide?: { aspect: number; label: string } };

function ImageField({ name, label, initial, aspect, crop }: { name: string; label: string; initial: string; aspect: string; crop: Crop }) {
  const t = useT();
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
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
            {busy ? t("Uploading…") : t("Upload")}
          </span>
        )}
        {url && <span className="absolute bottom-2 end-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">{busy ? t("Uploading…") : t("Change")}</span>}
      </button>
      <FramedCropper
        file={picked}
        title={crop.title}
        aspect={crop.aspect}
        outputWidth={crop.outputWidth}
        guide={crop.guide}
        onCancel={() => setPicked(null)}
        onDone={async (blob) => {
          setPicked(null);
          setBusy(true);
          try {
            const up = await uploadFile(new File([blob], `${name}.jpg`, { type: "image/jpeg" }), "image");
            setUrl(up.url ?? "");
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) setPicked(f);
        }}
      />
    </div>
  );
}

export function ProfileForm({ r }: { r: Record<string, string> }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.ok && <Alert tone="green">{state.message}</Alert>}
      <div className="grid grid-cols-[120px_1fr] gap-4">
        <ImageField name="logoUrl" label={t("Logo")} initial={r.logoUrl} aspect="aspect-square" crop={{ aspect: 1, outputWidth: 600, title: t("Adjust your logo") }} />
        <ImageField name="coverUrl" label={t("Cover photo")} initial={r.coverUrl} aspect="aspect-[16/9] max-w-sm" crop={{ aspect: 16 / 9, outputWidth: 1600, title: t("Adjust your cover photo"), guide: { aspect: 3.1, label: t("Visible on wide screens") } }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Restaurant name" error={fe.displayName}>
          <input name="displayName" className="input" defaultValue={r.displayName} required />
        </Field>
        <Field label="Legal business name" error={fe.businessName}>
          <input name="businessName" className="input" defaultValue={r.businessName} required />
        </Field>
        <Field label="Cuisine">
          <input name="cuisine" className="input" defaultValue={r.cuisine} placeholder={t("Lebanese, Grills")} />
        </Field>
        <Field label="Restaurant phone (customers call this about orders)" error={fe.phone}>
          <input name="phone" className="input" type="tel" defaultValue={r.phone} />
        </Field>
        <Field label="Email (billing notifications)" error={fe.email}>
          <input name="email" className="input" type="email" defaultValue={r.email} />
        </Field>
        <Field label="Area / neighborhood">
          <input name="area" className="input" defaultValue={r.area} placeholder={t("Hamra")} />
        </Field>
        <Field label="City">
          <input name="city" className="input" defaultValue={r.city} placeholder={t("Beirut")} />
        </Field>
        <Field label="Street address">
          <input name="address" className="input" defaultValue={r.address} />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" className="input" maxLength={600} defaultValue={r.description} />
      </Field>
      <Field label="Google Maps link (optional, shown on your profile)" error={fe.mapsUrl}>
        <input name="mapsUrl" className="input" defaultValue={r.mapsUrl} placeholder={t("https://maps.app.goo.gl/…")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="WhatsApp number" hint="Shown as a WhatsApp button on your profile. Empty = your restaurant phone if it's a mobile." error={fe.whatsapp}>
          <input name="whatsapp" type="tel" inputMode="tel" className="input" defaultValue={r.whatsapp ?? ""} placeholder="70 123 456" />
        </Field>
        {(["instagram", "tiktok", "facebook", "website"] as const).map((k) => (
          <Field key={k} label={{ instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", website: "Website" }[k]} error={fe[k]}>
            <input name={k} type="url" className="input" defaultValue={r[k] ?? ""} placeholder={k === "website" ? "https://" : `https://${k}.com/…`} />
          </Field>
        ))}
      </div>
      <Button type="submit" loading={pending}>
        {t("Save details")}
      </Button>
    </form>
  );
}

type ZoneRow = { maxKm: string; fee: string };

export function OrderingForm({ r, currencies, agreementAccepted }: { r: { avgPrepMinutes: string; deliveryEnabled: boolean; pickupEnabled: boolean; minOrder: string; currency: string; orderingEnabled: boolean; latitude: number | null; longitude: number | null; zones: ZoneRow[] }; currencies: string[]; agreementAccepted: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveOrderingAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const [pin, setPin] = useState<Pin | null>(r.latitude != null && r.longitude != null ? { lat: r.latitude, lng: r.longitude } : null);
  const [zones, setZones] = useState<ZoneRow[]>(r.zones.length ? r.zones : [{ maxKm: "3", fee: "1.5" }, { maxKm: "6", fee: "2.5" }]);
  const [delivery, setDelivery] = useState(r.deliveryEnabled);
  const radius = Math.max(0, ...zones.map((z) => Number(z.maxKm) || 0));
  const innerRings = zones.map((z) => Number(z.maxKm) || 0).filter((km) => km > 0 && km < radius);
  // Typed values apply on blur/Enter, so typing "15" doesn't briefly apply "1" and drop inner zones.
  const [radiusText, setRadiusText] = useState<string | null>(null);
  // The radius control edits the outermost zone; inner zones beyond the new radius are dropped.
  const setRadius = (km: number) => {
    if (!Number.isFinite(km) || km <= 0) return;
    const v = String(Math.min(MAX_ZONE_KM, Math.round(km * 10) / 10));
    const sorted = [...zones].sort((a, b) => (Number(a.maxKm) || 0) - (Number(b.maxKm) || 0));
    if (!sorted.length) return setZones([{ maxKm: v, fee: "" }]);
    const outer = { ...sorted[sorted.length - 1], maxKm: v };
    setZones([...sorted.slice(0, -1).filter((z) => (Number(z.maxKm) || 0) < Number(v)), outer]);
  };
  return (
    <form action={action} className="space-y-4">
      {state?.ok && <Alert tone="green">{state.message}</Alert>}
      {state?.error && <Alert tone="red">{state.error}</Alert>}
      <label className="flex items-center gap-3 rounded-xl bg-cream p-3 text-sm font-semibold">
        <input type="checkbox" name="orderingEnabled" defaultChecked={r.orderingEnabled} disabled={!agreementAccepted} className="h-5 w-5 accent-brand-500" />
        Accepting orders (turn off to pause ordering, e.g. when you&apos;re too busy)
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Average preparation time (minutes)" error={fe.avgPrepMinutes} hint="Suggested when you accept an order">
          <input name="avgPrepMinutes" type="number" min={5} max={180} className="input" defaultValue={r.avgPrepMinutes} required />
        </Field>
        <Field label={t("Minimum order ({currency}, optional)", { currency: r.currency })} error={fe.minOrder}>
          <input name="minOrder" className="input" inputMode="decimal" defaultValue={r.minOrder} />
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
          <input type="checkbox" name="deliveryEnabled" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} className="h-5 w-5 accent-brand-500" /> {t("Delivery")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pickupEnabled" defaultChecked={r.pickupEnabled} className="h-5 w-5 accent-brand-500" /> {t("Pickup")}
        </label>
      </div>

      <div>
        <div className="label">Restaurant location {delivery && <span className="text-brand-600">{t("(required for delivery)")}</span>}</div>
        <MapPicker value={pin} onChange={setPin} radiusKm={delivery && radius ? radius : undefined} rings={delivery ? innerRings : []} height={300} />
        {delivery && (
          <div className="mt-3 rounded-xl border border-black/10 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="radius-km" className="text-sm font-semibold">
                {t("Delivery radius")}
              </label>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <input
                  id="radius-km"
                  type="number"
                  min={0.5}
                  max={MAX_ZONE_KM}
                  step={0.5}
                  value={radiusText ?? (radius || "")}
                  onChange={(e) => setRadiusText(e.target.value)}
                  onBlur={() => {
                    if (radiusText !== null) setRadius(Number(radiusText));
                    setRadiusText(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className="input h-9 w-20 text-end text-sm"
                />
                {t("km")}
              </span>
            </div>
            <input type="range" min={0.5} max={30} step={0.5} value={Math.min(radius || 0.5, 30)} onChange={(e) => setRadius(Number(e.target.value))} className="mt-2 w-full accent-brand-500" aria-label={t("Delivery radius in km")} />
            <div className="flex justify-between text-[11px] text-ink-muted">
              <span>{t("0.5 km")}</span>
              <span>30 km (type up to {MAX_ZONE_KM})</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">{t("Customers outside the circle can still order pickup. Set fees per distance in the delivery zones below.")}</p>
          </div>
        )}
        <input type="hidden" name="latitude" value={pin?.lat ?? ""} />
        <input type="hidden" name="longitude" value={pin?.lng ?? ""} />
        {fe.location && <p className="mt-1 text-xs font-medium text-red-600">{fe.location}</p>}
      </div>

      {delivery && (
        <div>
          <div className="label">{t("Delivery zones")}</div>
          <p className="mb-2 text-xs text-ink-muted">Distance is measured in a straight line from your pin. Customers farther than your last zone can&apos;t order delivery (they can still pick up).</p>
          <div className="space-y-2">
            {zones.map((z, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 text-ink-muted">{t("Up to")}</span>
                <input className="input h-10 w-20 text-sm" inputMode="decimal" value={z.maxKm} onChange={(e) => setZones(zones.map((x, j) => (j === i ? { ...x, maxKm: e.target.value } : x)))} aria-label={t("Distance in km")} />
                <span className="text-ink-muted">{t("km →")}</span>
                <input className="input h-10 w-24 text-sm" inputMode="decimal" value={z.fee} onChange={(e) => setZones(zones.map((x, j) => (j === i ? { ...x, fee: e.target.value } : x)))} aria-label={`Fee in ${r.currency}`} />
                <span className="text-ink-muted">{r.currency}</span>
                <button type="button" onClick={() => setZones(zones.filter((_, j) => j !== i))} className="ms-auto grid h-9 w-9 place-items-center text-ink-muted" aria-label={t("Remove zone")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setZones([...zones, { maxKm: String((Number(zones.at(-1)?.maxKm) || 0) + 3), fee: "" }])} className="mt-2 text-sm font-semibold text-brand-600">
            {t("+ Add zone")}
          </button>
          {radius > 0 && <p className="mt-1 text-xs text-ink-muted">You deliver up to {radius} km (shown as the circle on the map).</p>}
          {fe.zones && <p className="mt-1 text-xs font-medium text-red-600">{fe.zones}</p>}
          <input type="hidden" name="zones" value={JSON.stringify(zones)} />
        </div>
      )}
      <Button type="submit" loading={pending}>
        {t("Save ordering settings")}
      </Button>
    </form>
  );
}

export function HoursEditor({ initial }: { initial: OpeningHours }) {
  const t = useT();
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
            {slots.length === 0 && <span className="text-sm text-ink-muted">{t("Closed")}</span>}
            {slots.map((s, i) => (
              <span key={i} className="flex items-center gap-1">
                <input type="time" className="input h-9 w-28 text-sm" value={s.open} onChange={(e) => set(d, slots.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} />
                –
                <input type="time" className="input h-9 w-28 text-sm" value={s.close} onChange={(e) => set(d, slots.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} />
                <button type="button" onClick={() => set(d, slots.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center text-ink-muted" aria-label={t("Remove time slot")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            ))}
            {slots.length < 3 && (
              <button type="button" onClick={() => set(d, [...slots, { open: "11:00", close: "23:00" }])} className="chip h-8 text-xs">
                <Plus className="h-3.5 w-3.5" /> {t("Hours")}
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
          {t("Save hours")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const mon = hours.mon ?? [{ open: "11:00", close: "23:00" }];
            setHours(Object.fromEntries(DAYS.map((d) => [d, mon])) as OpeningHours);
          }}
        >
          {t("Copy Monday to all days")}
        </Button>
      </div>
    </div>
  );
}
