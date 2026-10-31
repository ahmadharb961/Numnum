"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Bike, Check, Clock, Loader2, MapPin, Plus, ShoppingBag, AlertTriangle } from "lucide-react";
import { MapPicker, type Pin } from "@/components/map-picker";
import { distanceKm, formatKm, type DeliveryZone } from "@/lib/geo";
import { writeLocation } from "./location-picker";
import { useCart, lineTotal } from "./cart";
import { formatMoney, minorDigits } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, Field, Spinner } from "@/components/ui/misc";
import { PageHeader } from "./page-header";
import { api, track } from "./track";
import { useT } from "@/i18n/client";

type Info = {
  id: string;
  displayName: string;
  slug: string;
  phone: string | null;
  currency: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
  zones: DeliveryZone[];
  minOrderCents: number | null;
  orderingEnabled: boolean;
  openNow: boolean | null;
  avgPrepMinutes: number;
  address: string | null;
};

type Quote = { subtotalCents: number; deliveryFeeCents: number | null; distanceKm: number | null; deliveryError: string | null; totalCents: number | null; currency: string; errors: Record<string, string>; lines: { lineTotalCents: number }[] };
type SavedAddress = { id: string; label: string; area: string | null; address: string; building: string | null; notes: string | null; latitude: number | null; longitude: number | null; hasLocation: boolean; isDefault: boolean };
type Profile = { user: { name: string; phone: string | null } | null; addresses: SavedAddress[] };
type Details = { name: string; phone: string; address: string; building: string; area: string; notes: string };

const RECENT_KEY = "nn_recent_orders_v2";
const STEPS = ["Method", "Details", "Review & pay"] as const;

function newKey() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Checkout() {
  const t = useT();
  const { cart, ready, clear } = useCart();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"DELIVERY" | "PICKUP" | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null); // saved address, or null for a new one
  const [d, setD] = useState<Details>({ name: "", phone: "", address: "", building: "", area: "", notes: "" });
  const [pin, setPin] = useState<Pin | null>(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [addressLabel, setAddressLabel] = useState("");
  const [changeFor, setChangeFor] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  // Prefill name, phone and saved addresses from the account.
  useEffect(() => {
    fetch("/api/account/checkout-profile")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        if (p.user) {
          setD((x) => ({ ...x, name: x.name || p.user!.name, phone: x.phone || p.user!.phone || "" }));
          const def = p.addresses.find((a) => a.isDefault && a.hasLocation) ?? p.addresses.find((a) => a.hasLocation);
          if (def) setAddressId(def.id);
        }
      })
      .catch(() => setProfile({ user: null, addresses: [] }));
  }, []);

  useEffect(() => {
    if (!cart) return;
    track("checkout_started", { restaurantId: cart.restaurantId });
    fetch(`/api/restaurants/${cart.restaurantId}/checkout`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((i: Info) => {
        setInfo(i);
        if (i.deliveryEnabled && !i.pickupEnabled) setMethod("DELIVERY");
        if (!i.deliveryEnabled && i.pickupEnabled) setMethod("PICKUP");
      })
      .catch(() => setInfoError("This restaurant isn't available right now."));
  }, [cart?.restaurantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => cart?.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, selections: l.selections, note: l.note, reelId: l.reelId })) ?? [], [cart]);
  const localSubtotal = cart?.lines.reduce((s, l) => s + lineTotal(l), 0) ?? 0;
  const savedAddress = profile?.addresses.find((a) => a.id === addressId) ?? null;
  const point: Pin | null = savedAddress?.latitude != null && savedAddress.longitude != null ? { lat: savedAddress.latitude, lng: savedAddress.longitude } : pin;
  // Instant estimate for the UI; the server recalculates everything when the order is placed.
  const estimate = (p: Pin | null) => {
    if (!info || !p || info.latitude == null || info.longitude == null) return null;
    const km = distanceKm({ lat: info.latitude, lng: info.longitude }, p);
    const zone = info.zones.find((z) => km <= z.maxKm);
    return { km, feeCents: zone ? zone.feeCents : null, maxKm: info.zones.at(-1)?.maxKm ?? 0 };
  };

  // Idempotency key per checkout attempt: survives refresh & double taps; a changed cart gets a new key.
  const cartSig = useMemo(() => JSON.stringify(items) + method, [items, method]);
  const idemKey = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const stored = JSON.parse(sessionStorage.getItem("nn_idem") || "null");
      if (stored?.sig === cartSig) return stored.key as string;
      const key = newKey();
      sessionStorage.setItem("nn_idem", JSON.stringify({ sig: cartSig, key }));
      return key;
    } catch {
      return newKey();
    }
  }, [cartSig]);

  if (!ready) return <Center><Spinner className="text-brand-500" /></Center>;
  if (!cart || !cart.lines.length)
    return (
      <Center>
        <div className="text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 font-semibold">{t("Your cart is empty")}</p>
          <Link href="/" className="mt-3 inline-block font-semibold text-brand-600">
            {t("Find something tasty")}
          </Link>
        </div>
      </Center>
    );

  const currency = cart.currency;

  function validateDetails() {
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = "Enter your full name";
    const p = normalizePhone(d.phone);
    if (!p.ok) e.phone = p.error;
    if (method === "DELIVERY") {
      if (!savedAddress && d.address.trim().length < 4) e.address = "Enter your street address";
      if (!point) e.location = "Pin your delivery location on the map";
      else {
        const est = estimate(point);
        if (est && est.feeCents == null) e.location = t("This address is {km} away — {name} delivers up to {max}.", { km: formatKm(est.km), name: info?.displayName, max: formatKm(est.maxKm) }) + ` Choose pickup or another address.`;
      }
    }
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) requestAnimationFrame(() => (document.getElementById(first) ?? document.querySelector("[data-error]"))?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return Object.keys(e).length === 0;
  }

  async function goReview() {
    if (!validateDetails()) return;
    if (method === "DELIVERY" && point) writeLocation({ ...point, label: savedAddress?.label ?? (d.area.trim() || "your address") });
    track("order_details_completed", { restaurantId: cart!.restaurantId });
    setStep(2);
    setQuote(null);
    setPlaceError(null);
    try {
      setQuote(await api<Quote>("/api/cart/quote", { restaurantId: cart!.restaurantId, items, fulfillment: method, addressId: savedAddress?.id ?? null, latitude: savedAddress ? null : pin?.lat ?? null, longitude: savedAddress ? null : pin?.lng ?? null }));
    } catch (e) {
      setPlaceError((e as Error).message);
    }
  }

  async function placeOrder() {
    setPlacing(true);
    setPlaceError(null);
    try {
      const delivery = method === "DELIVERY";
      const order = await api<{ reference: string; trackingToken: string }>("/api/orders", {
        idempotencyKey: idemKey,
        restaurantId: cart!.restaurantId,
        fulfillment: method,
        items,
        changeFor: changeFor.trim() || null,
        customer: {
          name: d.name.trim(),
          phone: d.phone,
          addressId: delivery && savedAddress ? savedAddress.id : null,
          address: delivery && !savedAddress ? d.address.trim() : null,
          building: delivery && !savedAddress ? d.building.trim() || null : null,
          area: delivery && !savedAddress ? d.area.trim() || null : null,
          notes: d.notes.trim() || null,
          latitude: delivery && !savedAddress ? pin?.lat ?? null : null,
          longitude: delivery && !savedAddress ? pin?.lng ?? null : null,
          saveAddress: delivery && !savedAddress && saveAddress,
          addressLabel: addressLabel.trim() || null,
        },
      });
      try {
        const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as { ref: string; t: string }[];
        localStorage.setItem(RECENT_KEY, JSON.stringify([{ ref: order.reference, t: order.trackingToken }, ...recent.filter((r) => r.ref !== order.reference)].slice(0, 20)));
        sessionStorage.removeItem("nn_idem");
      } catch {}
      clear();
      router.replace(`/order/${order.reference}?t=${order.trackingToken}&placed=1`);
    } catch (e) {
      const err = e as Error & { fieldErrors?: Record<string, string> };
      setPlaceError(err.message + (err.fieldErrors ? `: ${Object.values(err.fieldErrors)[0]}` : ""));
      setPlacing(false);
    }
  }

  const subtotal = quote?.subtotalCents ?? localSubtotal;
  const fee = method === "DELIVERY" ? (quote ? quote.deliveryFeeCents : estimate(point)?.feeCents ?? null) : 0;
  const total = fee == null ? null : subtotal + fee;
  const quoteChanged = quote && quote.subtotalCents !== localSubtotal;
  const below = info?.minOrderCents && subtotal < info.minOrderCents;
  const unitLabel = currency === "LBP" ? "LBP" : "$";

  return (
    <main className="pb-nav">
      <PageHeader title="Checkout" sub={cart.restaurantName} />
      <div className="container-app pt-4">
        <ol className="mb-5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", i < step ? "bg-emerald-500 text-white" : i === step ? "bg-ink text-white" : "bg-black/10 text-ink-muted")}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>
              <span className={cn("whitespace-nowrap text-sm font-semibold", i === step ? "text-ink" : "text-ink-muted")}>{t(s)}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-black/10" />}
            </li>
          ))}
        </ol>

        {infoError && <Alert tone="red">{infoError}</Alert>}
        {info && !info.orderingEnabled && <Alert tone="amber">{info.displayName} isn&apos;t taking online orders right now.</Alert>}
        {info && info.orderingEnabled && info.openNow === false && (
          <Alert tone="amber" className="mb-4">
            <Clock className="me-1 inline h-4 w-4" /> {info.displayName} is closed right now. You can place your order when it opens.
          </Alert>
        )}
        {!info && !infoError && (
          <div className="grid place-items-center py-16">
            <Spinner className="text-brand-500" />
          </div>
        )}

        {info && info.orderingEnabled && step === 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold">{t("How would you like your order?")}</h2>
            {info.deliveryEnabled && (
              <MethodCard
                active={method === "DELIVERY"}
                onClick={() => setMethod("DELIVERY")}
                icon={<Bike className="h-6 w-6" />}
                title={t("Delivery")}
                body={t("Up to {km} · fee from {fee}", { km: formatKm(info.zones.at(-1)?.maxKm ?? 0), fee: info.zones[0]?.feeCents ? formatMoney(info.zones[0].feeCents, currency) : t("free") }) + ` · about ${info.avgPrepMinutes + 15} min`}
              />
            )}
            {info.pickupEnabled && <MethodCard active={method === "PICKUP"} onClick={() => setMethod("PICKUP")} icon={<ShoppingBag className="h-6 w-6" />} title={t("Pickup")} body={t("Ready in about {n} min", { n: info.avgPrepMinutes }) + (info.address ? ` · ${info.address}` : "")} />}
            {!info.deliveryEnabled && !info.pickupEnabled && <Alert tone="amber">This restaurant hasn&apos;t set up delivery or pickup yet.</Alert>}
            <Button size="lg" block disabled={!method || info.openNow === false} onClick={() => setStep(1)} className="mt-4">
              {t("Continue")}
            </Button>
          </div>
        )}

        {info && info.orderingEnabled && step === 1 && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void goReview();
            }}
            noValidate
          >
            <h2 className="text-lg font-extrabold">{t("Your details")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.name} htmlFor="name">
                <input id="name" className="input" autoComplete="name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
              </Field>
              <Field label="Phone number" error={errors.phone} hint="The restaurant or driver may call you" htmlFor="phone">
                <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="70 123 456" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
              </Field>
            </div>

            {method === "DELIVERY" && (
              <>
                <h2 className="pt-2 text-lg font-extrabold">{t("Delivery address")}</h2>
                {profile?.addresses.length ? (
                  <div className="space-y-2" role="radiogroup" aria-label={t("Saved addresses")}>
                    {profile.addresses.map((a) => {
                      const est = a.latitude != null && a.longitude != null ? estimate({ lat: a.latitude, lng: a.longitude }) : null;
                      const usable = a.hasLocation && est?.feeCents != null;
                      return (
                        <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} disabled={!usable} onClick={() => setAddressId(a.id)} className={cn("flex w-full items-start gap-3 rounded-2xl border-2 bg-white p-3.5 text-start disabled:opacity-60", addressId === a.id ? "border-brand-500" : "border-transparent")}>
                          <MapPin className={cn("mt-0.5 h-5 w-5 shrink-0", addressId === a.id ? "text-brand-500" : "text-ink-muted")} />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-bold">{a.label}</span>
                            <span className="block text-ink-soft">{[a.area, a.address, a.building].filter(Boolean).join(", ")}</span>
                            {!a.hasLocation && <span className="block text-xs font-semibold text-amber-700">{t("No map pin — edit it in Saved addresses")}</span>}
                            {est && est.feeCents == null && <span className="block text-xs font-semibold text-red-600">{formatKm(est.km)} away · outside delivery range</span>}
                          </span>
                          {est && est.feeCents != null && (
                            <span className="text-end text-xs font-semibold text-ink-muted">
                              {formatKm(est.km)}
                              <span className="block tabular">{est.feeCents ? `+${formatMoney(est.feeCents, currency)}` : t("Free")}</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setAddressId(null)} className={cn("flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3.5 text-start text-sm font-semibold", addressId === null ? "border-brand-500" : "border-dashed border-black/15")}>
                      <Plus className="h-5 w-5" /> {t("Deliver to a new address")}
                    </button>
                  </div>
                ) : null}

                {!savedAddress && (
                  <div className="space-y-4">
                    <div>
                      <div className="label">
                        {t("Pin your exact location")} <span className="text-brand-600">{t("(required)")}</span>
                      </div>
                      <MapPicker value={pin} onChange={setPin} autoLocate={!pin} height={280} />
                      {pin && (() => {
                        const est = estimate(pin);
                        if (!est) return null;
                        return est.feeCents == null ? (
                          <p className="mt-1 text-xs font-semibold text-red-600">{formatKm(est.km)} away — {info.displayName} delivers up to {formatKm(est.maxKm)}</p>
                        ) : (
                          <p className="mt-1 text-xs font-semibold text-emerald-700">
                            ✓ {formatKm(est.km)} away · delivery {est.feeCents ? formatMoney(est.feeCents, currency) : "free"}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Area / neighborhood" htmlFor="area">
                        <input id="area" className="input" placeholder={t("Hamra")} value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })} />
                      </Field>
                      <Field label="Building & floor (optional)" htmlFor="building">
                        <input id="building" className="input" placeholder={t("Bldg. Azar, 3rd floor")} value={d.building} onChange={(e) => setD({ ...d, building: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Street address" error={errors.address} htmlFor="address">
                      <textarea id="address" className="input min-h-[72px]" autoComplete="street-address" placeholder={t("Street, landmark")} value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
                    </Field>
                    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-sm">
                      <label className="flex items-center gap-2 font-semibold">
                        <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="h-5 w-5 accent-brand-500" /> {t("Save to my addresses")}
                      </label>
                      {saveAddress && <input className="input h-10 w-40 text-sm" placeholder={t("Label (Home, Work…)")} value={addressLabel} onChange={(e) => setAddressLabel(e.target.value)} />}
                    </div>
                  </div>
                )}
                {errors.location && <p id="location" className="text-sm font-medium text-red-600">{t(errors.location)}</p>}
              </>
            )}

            <Field label={method === "DELIVERY" ? t("Notes for the driver (optional)") : t("Pickup notes (optional)")} htmlFor="notes">
              <textarea id="notes" className="input min-h-[72px]" maxLength={400} placeholder={method === "DELIVERY" ? t("Ring twice, call on arrival…") : t("I'll arrive around 8pm")} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                {t("Back")}
              </Button>
              <Button type="submit" size="lg" className="col-span-2">
                {t("Review order")}
              </Button>
            </div>
          </form>
        )}

        {info && info.orderingEnabled && step === 2 && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("Order from")}</div>
                  <div className="font-bold">{info.displayName}</div>
                </div>
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-bold">{method === "DELIVERY" ? t("Delivery") : t("Pickup")}</span>
              </div>
              <div className="mt-3 divide-y divide-black/5">
                {cart.lines.map((l, i) => (
                  <div key={l.key} className="py-2.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">
                        {l.quantity} × {l.name}
                      </span>
                      <span className="tabular font-semibold">{formatMoney(quote?.lines[i]?.lineTotalCents ?? lineTotal(l), currency)}</span>
                    </div>
                    {l.summary.length > 0 && <div className="mt-0.5 text-xs text-ink-muted">{l.summary.join(" · ")}</div>}
                    {l.note && <div className="mt-0.5 text-xs italic text-ink-muted">“{l.note}”</div>}
                    {quote?.errors[`items.${i}`] && <div className="mt-1 text-xs font-semibold text-red-600">{quote.errors[`items.${i}`]}</div>}
                  </div>
                ))}
              </div>
              <div className="mt-2 space-y-1.5 border-t border-black/10 pt-3 text-sm">
                <Row label={t("Subtotal")} value={quote ? formatMoney(subtotal, currency) : <Loader2 className="h-4 w-4 animate-spin" />} />
                {method === "DELIVERY" && <Row label={t("Delivery fee")} value={fee == null ? "—" : fee === 0 ? t("Free") : formatMoney(fee, currency)} />}
                <Row label={t("Total")} value={total == null ? "—" : formatMoney(total, currency)} bold />
              </div>
            </div>

            <div className="card p-4 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{method === "DELIVERY" ? t("Deliver to") : t("Pickup by")}</div>
              <div className="font-semibold">
                {d.name} · {d.phone}
              </div>
              {method === "DELIVERY" && <div className="mt-1 text-ink-soft">{savedAddress ? `${savedAddress.label}: ${[savedAddress.area, savedAddress.address, savedAddress.building].filter(Boolean).join(", ")}` : [d.area, d.address, d.building].filter(Boolean).join(", ")}</div>}
              {method === "DELIVERY" && quote?.distanceKm != null && <div className="mt-1 text-xs text-emerald-700">📍 {formatKm(quote.distanceKm)} from {info.displayName}</div>}
              {d.notes && <div className="mt-1 text-xs text-ink-muted">Note: {d.notes}</div>}
              <button className="mt-2 text-xs font-semibold text-brand-600" onClick={() => setStep(1)}>
                {t("Edit details")}
              </button>
            </div>

            <div className="card p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("Payment")}</div>
              <div className="flex items-center gap-3 rounded-xl border-2 border-brand-500 bg-brand-50/40 p-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500 text-white">
                  <Banknote className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <div className="font-bold">{method === "DELIVERY" ? t("Cash on delivery") : t("Cash at pickup")}</div>
                  <div className="text-xs text-ink-muted">{t("Pay {amount} in cash when you receive your order", { amount: total == null ? t("the total") : formatMoney(total, currency) })}</div>
                </div>
                <Check className="h-5 w-5 text-brand-600" />
              </div>
              <label className="mt-3 block">
                <span className="label">{t("Paying with a bigger bill? (optional)")}</span>
                <div className="relative">
                  <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">{unitLabel}</span>
                  <input className={cn("input", currency === "LBP" ? "ps-12" : "ps-8")} inputMode={minorDigits(currency) ? "decimal" : "numeric"} placeholder={currency === "LBP" ? "e.g. 1,000,000" : "e.g. 50"} value={changeFor} onChange={(e) => setChangeFor(e.target.value)} />
                </div>
                <span className="mt-1 block text-xs text-ink-muted">So the {method === "DELIVERY" ? "driver" : "restaurant"} can bring change.</span>
              </label>
            </div>

            {quoteChanged && (
              <Alert tone="amber">
                <AlertTriangle className="me-1 inline h-4 w-4" /> {t("Prices were updated by the restaurant. The totals above are the current prices.")}
              </Alert>
            )}
            {below && <Alert tone="amber">Minimum order is {formatMoney(info.minOrderCents!, currency)}.</Alert>}
            {quote?.deliveryError && <Alert tone="red">{quote.deliveryError}</Alert>}
            {placeError && <Alert tone="red">{placeError}</Alert>}
            <Button size="lg" block onClick={placeOrder} loading={placing} disabled={!quote || Object.keys(quote.errors).length > 0 || !!below || total == null}>
              Place order{total != null ? ` · ${formatMoney(total, currency)}` : ""}
            </Button>
            <p className="text-center text-xs text-ink-muted">
              {t("By placing your order you agree to our")} <Link href="/terms" className="underline">{t("terms")}</Link>. Your name, phone and address are shared with {info.displayName} to deliver your order.
            </p>
            {quote && Object.keys(quote.errors).length > 0 && (
              <Button variant="outline" block onClick={() => router.push("/cart")}>
                {t("Fix cart")}
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[60dvh] place-items-center">{children}</div>;
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-bold" : "text-ink-muted"}>{label}</span>
      <span className={cn("tabular", bold && "text-base font-extrabold")}>{value}</span>
    </div>
  );
}

function MethodCard({ active, onClick, icon, title, body }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-4 rounded-2xl border-2 bg-white p-4 text-start transition", active ? "border-brand-500 ring-4 ring-brand-500/10" : "border-transparent shadow-sm")}>
      <span className={cn("grid h-12 w-12 place-items-center rounded-xl", active ? "bg-brand-500 text-white" : "bg-black/5")}>{icon}</span>
      <span className="flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-ink-muted">{body}</span>
      </span>
      <span className={cn("grid h-6 w-6 place-items-center rounded-full border-2", active ? "border-brand-500 bg-brand-500 text-white" : "border-black/20")}>{active && <Check className="h-4 w-4" />}</span>
    </button>
  );
}
