"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRestaurantAdminAction } from "@/actions/admin";
import { MapPicker, type Pin } from "@/components/map-picker";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";

type F = Record<string, string>;
const EMPTY: F = { displayName: "", businessName: "", cuisine: "", description: "", phone: "", email: "", address: "", area: "", city: "Beirut", currency: "USD", ownerName: "", ownerEmail: "", ownerPassword: "", commissionRate: "", deliveryKm: "5", deliveryFee: "1", avgPrepMinutes: "25" };

/** Admin: create a complete restaurant with its owner account, location, delivery and commission. */
export function RestaurantCreateForm({ defaultRate }: { defaultRate: number }) {
  const router = useRouter();
  const [f, setF] = useState<F>(EMPTY);
  const [pin, setPin] = useState<Pin | null>(null);
  const [flags, setFlags] = useState({ deliveryEnabled: true, pickupEnabled: true, live: true, agreementSigned: false, verified: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const flag = (k: keyof typeof flags) => (
    <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} className="h-5 w-5 accent-brand-500" />
  );

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createRestaurantAdminAction({ ...(f as { displayName: string; phone: string; ownerName: string; ownerEmail: string }), ...flags, latitude: pin?.lat, longitude: pin?.lng, currency: f.currency as "USD" | "LBP", avgPrepMinutes: Number(f.avgPrepMinutes) });
      if (r.ok) router.push(`/admin/restaurants/${r.id}?created=1`);
      else {
        setErrors(r.fieldErrors ?? {});
        setError(r.error ?? (r.fieldErrors ? "Please fix the highlighted fields" : "Something went wrong"));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

  const input = (k: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input id={k} className="input" value={f[k]} onChange={set(k)} {...props} />;

  return (
    <div className="space-y-5">
      {error && <Alert tone="red">{error}</Alert>}

      <section className="card space-y-4 p-5">
        <h2 className="font-extrabold">Restaurant</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Restaurant name (shown to customers)" error={errors.displayName} htmlFor="displayName">{input("displayName", { placeholder: "Burger House" })}</Field>
          <Field label="Legal business name" hint="Defaults to the restaurant name" error={errors.businessName} htmlFor="businessName">{input("businessName")}</Field>
          <Field label="Cuisine" error={errors.cuisine} htmlFor="cuisine">{input("cuisine", { placeholder: "Burgers, American" })}</Field>
          <Field label="Restaurant phone" error={errors.phone} htmlFor="phone">{input("phone", { type: "tel", placeholder: "70 123 456" })}</Field>
          <Field label="Contact email (billing)" hint="Defaults to the owner's email" error={errors.email} htmlFor="email">{input("email", { type: "email" })}</Field>
          <Field label="Menu currency" error={errors.currency} htmlFor="currency">
            <select id="currency" className="input" value={f.currency} onChange={set("currency")}>
              <option value="USD">USD ($)</option>
              <option value="LBP">LBP (ل.ل)</option>
            </select>
          </Field>
          <Field label="Street address" error={errors.address} htmlFor="address">{input("address")}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area" error={errors.area} htmlFor="area">{input("area", { placeholder: "Hamra" })}</Field>
            <Field label="City" error={errors.city} htmlFor="city">{input("city")}</Field>
          </div>
        </div>
        <Field label="Description (optional)" error={errors.description} htmlFor="description">
          <textarea id="description" className="input" rows={2} value={f.description} onChange={set("description")} />
        </Field>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-extrabold">Owner account</h2>
        <p className="-mt-2 text-sm text-ink-muted">If this email already has an account, it becomes the owner (no password needed). Otherwise a new account is created with this temporary password — share it with the owner.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owner name" error={errors.ownerName} htmlFor="ownerName">{input("ownerName")}</Field>
          <Field label="Owner email (login)" error={errors.ownerEmail} htmlFor="ownerEmail">{input("ownerEmail", { type: "email" })}</Field>
          <Field label="Temporary password" error={errors.ownerPassword} htmlFor="ownerPassword">{input("ownerPassword", { type: "text", placeholder: "min 8 characters", autoComplete: "new-password" })}</Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-extrabold">Location, delivery & pickup</h2>
        <div className="flex flex-wrap gap-5 text-sm font-semibold">
          <label className="flex items-center gap-2">{flag("deliveryEnabled")} Delivery</label>
          <label className="flex items-center gap-2">{flag("pickupEnabled")} Pickup</label>
        </div>
        {errors.deliveryEnabled && <p className="text-sm font-medium text-red-600">{errors.deliveryEnabled}</p>}
        <div>
          <div className="label">Pin the restaurant on the map</div>
          <MapPicker value={pin} onChange={setPin} radiusKm={flags.deliveryEnabled ? Number(f.deliveryKm) || undefined : undefined} height={280} />
          {errors.location && <p className="mt-1 text-sm font-medium text-red-600">{errors.location}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {flags.deliveryEnabled && (
            <>
              <Field label="Delivery radius (km)" error={errors.deliveryKm} htmlFor="deliveryKm">{input("deliveryKm", { inputMode: "decimal" })}</Field>
              <Field label={`Delivery fee (${f.currency})`} hint="0 for free delivery. Add more zones later in its settings." error={errors.deliveryFee} htmlFor="deliveryFee">{input("deliveryFee", { inputMode: "decimal" })}</Field>
            </>
          )}
          <Field label="Average preparation time (minutes)" error={errors.avgPrepMinutes} htmlFor="avgPrepMinutes">{input("avgPrepMinutes", { inputMode: "numeric" })}</Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-extrabold">Commission & status</h2>
        <Field label="Commission rate (%)" hint={`Leave empty to use the platform default (${defaultRate}%). 0 = no commission.`} error={errors.commissionRate} htmlFor="commissionRate">
          {input("commissionRate", { inputMode: "decimal", placeholder: `${defaultRate}` })}
        </Field>
        <label className="flex items-start gap-3 text-sm">
          {flag("agreementSigned")}
          <span>
            <b>The owner accepted the commission agreement</b> (signed offline). Recorded with today&apos;s date and the current agreement version.
          </span>
        </label>
        {errors.agreementSigned && <p className="text-sm font-medium text-red-600">{errors.agreementSigned}</p>}
        <label className="flex items-start gap-3 text-sm">
          {flag("live")}
          <span>
            <b>Live now</b> — visible to customers and taking orders. Untick to create it as a draft and finish the menu first.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          {flag("verified")}
          <span>
            <b>Verified</b> — show the verified badge (you checked their business documents).
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" loading={pending} onClick={submit}>
          Create restaurant
        </Button>
        <p className="text-sm text-ink-muted">Next: add its menu, photos and reels with “Manage as admin”.</p>
      </div>
    </div>
  );
}
