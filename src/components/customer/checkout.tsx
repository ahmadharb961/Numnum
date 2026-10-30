"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Bike, Check, Clock, Loader2, LocateFixed, MapPin, Plus, ShoppingBag, AlertTriangle } from "lucide-react";
import { useCart, lineTotal } from "./cart";
import { formatMoney, minorDigits } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, Field, Spinner } from "@/components/ui/misc";
import { PageHeader } from "./page-header";
import { api, track } from "./track";

type Info = {
  id: string;
  displayName: string;
  slug: string;
  phone: string | null;
  currency: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  requireMapsLocation: boolean;
  deliveryFeeCents: number | null;
  minOrderCents: number | null;
  orderingEnabled: boolean;
  openNow: boolean | null;
  avgPrepMinutes: number;
  address: string | null;
  deliveryAreas: { name: string; feeCents: number | null }[];
};

type Quote = { subtotalCents: number; deliveryFeeCents: number | null; totalCents: number | null; currency: string; errors: Record<string, string>; lines: { lineTotalCents: number }[] };
type SavedAddress = { id: string; label: string; area: string | null; address: string; building: string | null; notes: string | null; hasLocation: boolean; isDefault: boolean };
type Profile = { user: { name: string; phone: string | null } | null; addresses: SavedAddress[] };
type Details = { name: string; phone: string; address: string; building: string; area: string; notes: string; mapsUrl: string; latitude: number | null; longitude: number | null };

const DETAILS_KEY = "nn_details_v1";
const RECENT_KEY = "nn_recent_orders_v2";
const STEPS = ["Method", "Details", "Review & pay"] as const;

function newKey() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Checkout({ mapsKey }: { mapsKey: string }) {
  const { cart, ready, clear } = useCart();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"DELIVERY" | "PICKUP" | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null); // saved address, or null for a new one
  const [d, setD] = useState<Details>({ name: "", phone: "", address: "", building: "", area: "", notes: "", mapsUrl: "", latitude: null, longitude: null });
  const [saveAddress, setSaveAddress] = useState(true);
  const [addressLabel, setAddressLabel] = useState("");
  const [remember, setRemember] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Prefill: account profile + saved addresses, or details remembered on this device (guests).
  useEffect(() => {
    fetch("/api/account/checkout-profile")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        if (p.user) {
          setD((x) => ({ ...x, name: x.name || p.user!.name, phone: x.phone || p.user!.phone || "" }));
          const def = p.addresses.find((a) => a.isDefault) ?? p.addresses[0];
          if (def) setAddressId(def.id);
        } else {
          try {
            const saved = localStorage.getItem(DETAILS_KEY);
            if (saved) {
              setD((x) => ({ ...x, ...JSON.parse(saved) }));
              setRemember(true);
            }
          } catch {}
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
  const area = method === "DELIVERY" ? (savedAddress ? savedAddress.area : d.area) : null;
  const feeForArea = (name: string | null) => {
    if (!info) return null;
    if (info.deliveryAreas.length) {
      const a = info.deliveryAreas.find((x) => x.name.toLowerCase() === (name ?? "").toLowerCase());
      return a ? (a.feeCents ?? info.deliveryFeeCents) : null;
    }
    return info.deliveryFeeCents;
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
          <p className="mt-3 font-semibold">Your cart is empty</p>
          <Link href="/" className="mt-3 inline-block font-semibold text-brand-600">
            Find something tasty
          </Link>
        </div>
      </Center>
    );

  const currency = cart.currency;
  const loggedIn = !!profile?.user;

  function validateDetails() {
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = "Enter your full name";
    const p = normalizePhone(d.phone);
    if (!p.ok) e.phone = p.error;
    if (method === "DELIVERY" && !savedAddress) {
      if (info?.deliveryAreas.length && !d.area) e.area = "Choose your area";
      if (d.address.trim().length < 4) e.address = "Enter your delivery address";
      if (info?.requireMapsLocation && !d.mapsUrl && d.latitude == null) e.mapsUrl = "This restaurant needs your location on the map";
      if (d.mapsUrl && d.latitude == null && !/^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(d.mapsUrl)) e.mapsUrl = "Paste a Google Maps link (maps.google.com or maps.app.goo.gl)";
    }
    if (method === "DELIVERY" && savedAddress && info?.deliveryAreas.length && feeForArea(savedAddress.area) == null) e.addressId = `${info.displayName} doesn't deliver to ${savedAddress.area ?? "this address"}`;
    if (method === "DELIVERY" && !savedAddress && d.area && feeForArea(d.area) == null) e.area = "This restaurant doesn't deliver to that area";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function goReview() {
    if (!validateDetails()) return;
    try {
      if (!loggedIn) {
        if (remember) localStorage.setItem(DETAILS_KEY, JSON.stringify({ name: d.name, phone: d.phone, address: d.address, building: d.building, area: d.area }));
        else localStorage.removeItem(DETAILS_KEY);
      }
    } catch {}
    track("order_details_completed", { restaurantId: cart!.restaurantId });
    setStep(2);
    setQuote(null);
    setPlaceError(null);
    try {
      setQuote(await api<Quote>("/api/cart/quote", { restaurantId: cart!.restaurantId, items, fulfillment: method, area }));
    } catch (e) {
      setPlaceError((e as Error).message);
    }
  }

  function locate() {
    if (!navigator.geolocation) return setErrors((e) => ({ ...e, mapsUrl: "Location isn't available on this device" }));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6)), lng = Number(pos.coords.longitude.toFixed(6));
        setD((p) => ({ ...p, latitude: lat, longitude: lng, mapsUrl: `https://maps.google.com/?q=${lat},${lng}` }));
        setErrors((e) => ({ ...e, mapsUrl: "" }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setErrors((e) => ({ ...e, mapsUrl: "We couldn't get your location. Paste a Google Maps link instead." }));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
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
          area: delivery && !savedAddress ? d.area || null : null,
          notes: d.notes.trim() || null,
          mapsUrl: delivery && !savedAddress && d.latitude == null ? d.mapsUrl || null : null,
          latitude: delivery && !savedAddress ? d.latitude : null,
          longitude: delivery && !savedAddress ? d.longitude : null,
          saveAddress: delivery && loggedIn && !savedAddress && saveAddress,
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
  const fee = method === "DELIVERY" ? (quote ? quote.deliveryFeeCents : feeForArea(area)) : 0;
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
              <span className={cn("whitespace-nowrap text-sm font-semibold", i === step ? "text-ink" : "text-ink-muted")}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-black/10" />}
            </li>
          ))}
        </ol>

        {infoError && <Alert tone="red">{infoError}</Alert>}
        {info && !info.orderingEnabled && <Alert tone="amber">{info.displayName} isn&apos;t taking online orders right now.</Alert>}
        {info && info.orderingEnabled && info.openNow === false && (
          <Alert tone="amber" className="mb-4">
            <Clock className="mr-1 inline h-4 w-4" /> {info.displayName} is closed right now. You can place your order when it opens.
          </Alert>
        )}
        {!info && !infoError && (
          <div className="grid place-items-center py-16">
            <Spinner className="text-brand-500" />
          </div>
        )}

        {info && info.orderingEnabled && step === 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold">How would you like your order?</h2>
            {info.deliveryEnabled && (
              <MethodCard
                active={method === "DELIVERY"}
                onClick={() => setMethod("DELIVERY")}
                icon={<Bike className="h-6 w-6" />}
                title="Delivery"
                body={info.deliveryAreas.length ? `Fee depends on your area · about ${info.avgPrepMinutes + 15} min` : `${info.deliveryFeeCents ? `Delivery fee ${formatMoney(info.deliveryFeeCents, currency)}` : "Free delivery"} · about ${info.avgPrepMinutes + 15} min`}
              />
            )}
            {info.pickupEnabled && <MethodCard active={method === "PICKUP"} onClick={() => setMethod("PICKUP")} icon={<ShoppingBag className="h-6 w-6" />} title="Pickup" body={`Ready in about ${info.avgPrepMinutes} min${info.address ? ` · ${info.address}` : ""}`} />}
            {!info.deliveryEnabled && !info.pickupEnabled && <Alert tone="amber">This restaurant hasn&apos;t set up delivery or pickup yet.</Alert>}
            <Button size="lg" block disabled={!method || info.openNow === false} onClick={() => setStep(1)} className="mt-4">
              Continue
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
            {!loggedIn && profile && (
              <div className="rounded-2xl bg-white p-3.5 text-sm">
                Ordering as a guest. <Link href="/login?next=/checkout" className="font-semibold text-brand-600">Log in</Link> or{" "}
                <Link href="/account/register?next=/checkout" className="font-semibold text-brand-600">create an account</Link> to save addresses and see your order history.
              </div>
            )}
            <h2 className="text-lg font-extrabold">Your details</h2>
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
                <h2 className="pt-2 text-lg font-extrabold">Delivery address</h2>
                {profile?.addresses.length ? (
                  <div className="space-y-2" role="radiogroup" aria-label="Saved addresses">
                    {profile.addresses.map((a) => {
                      const aFee = feeForArea(a.area);
                      return (
                        <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)} className={cn("flex w-full items-start gap-3 rounded-2xl border-2 bg-white p-3.5 text-left", addressId === a.id ? "border-brand-500" : "border-transparent")}>
                          <MapPin className={cn("mt-0.5 h-5 w-5 shrink-0", addressId === a.id ? "text-brand-500" : "text-ink-muted")} />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-bold">{a.label}</span>
                            <span className="block text-ink-soft">{[a.area, a.address, a.building].filter(Boolean).join(", ")}</span>
                            {aFee == null && info.deliveryAreas.length > 0 && <span className="block text-xs font-semibold text-red-600">Outside this restaurant&apos;s delivery areas</span>}
                          </span>
                          {aFee != null && <span className="tabular text-xs font-semibold text-ink-muted">{aFee ? `+${formatMoney(aFee, currency)}` : "Free"}</span>}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setAddressId(null)} className={cn("flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3.5 text-left text-sm font-semibold", addressId === null ? "border-brand-500" : "border-dashed border-black/15")}>
                      <Plus className="h-5 w-5" /> Use a new address
                    </button>
                    {errors.addressId && <p className="text-xs font-medium text-red-600">{errors.addressId}</p>}
                  </div>
                ) : null}

                {!savedAddress && (
                  <div className="space-y-4">
                    {info.deliveryAreas.length > 0 && (
                      <Field label="Area" error={errors.area} htmlFor="area">
                        <select id="area" className="input" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })}>
                          <option value="">Choose your area</option>
                          {info.deliveryAreas.map((a) => (
                            <option key={a.name} value={a.name}>
                              {a.name} · {(a.feeCents ?? info.deliveryFeeCents) ? formatMoney((a.feeCents ?? info.deliveryFeeCents)!, currency) : "free"}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field label="Street address" error={errors.address} htmlFor="address">
                      <textarea id="address" className="input min-h-[80px]" autoComplete="street-address" placeholder="Street, landmark, city" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
                    </Field>
                    <Field label="Building & floor (optional)" htmlFor="building">
                      <input id="building" className="input" placeholder="Bldg. Azar, 3rd floor" value={d.building} onChange={(e) => setD({ ...d, building: e.target.value })} />
                    </Field>
                    <div>
                      <div className="label">
                        Location on the map {info.requireMapsLocation ? <span className="text-brand-600">(required)</span> : <span className="font-normal text-ink-muted">(optional, helps the driver)</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={locate} loading={locating} className="shrink-0">
                          <LocateFixed className="h-4 w-4" /> Use my location
                        </Button>
                        <input className="input" placeholder="or paste a Google Maps link" value={d.latitude != null ? "" : d.mapsUrl} onChange={(e) => setD({ ...d, mapsUrl: e.target.value, latitude: null, longitude: null })} />
                      </div>
                      {d.latitude != null && (
                        <div className="mt-2 overflow-hidden rounded-xl border border-black/10">
                          <iframe title="Your location" className="h-40 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapsKey ? `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${d.latitude},${d.longitude}&zoom=16` : `https://maps.google.com/maps?q=${d.latitude},${d.longitude}&z=16&output=embed`} />
                          <div className="flex items-center justify-between bg-white px-3 py-2 text-xs">
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <MapPin className="h-3.5 w-3.5" /> Location pinned
                            </span>
                            <button type="button" className="font-semibold text-ink-muted" onClick={() => setD({ ...d, latitude: null, longitude: null, mapsUrl: "" })}>
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                      {errors.mapsUrl && <p className="mt-1 text-xs font-medium text-red-600">{errors.mapsUrl}</p>}
                    </div>
                    {loggedIn && (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-sm">
                        <label className="flex items-center gap-2 font-semibold">
                          <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="h-5 w-5 accent-brand-500" /> Save to my addresses
                        </label>
                        {saveAddress && <input className="input h-10 w-40 text-sm" placeholder="Label (Home, Work…)" value={addressLabel} onChange={(e) => setAddressLabel(e.target.value)} />}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <Field label={method === "DELIVERY" ? "Notes for the driver (optional)" : "Pickup notes (optional)"} htmlFor="notes">
              <textarea id="notes" className="input min-h-[72px]" maxLength={400} placeholder={method === "DELIVERY" ? "Ring twice, call on arrival…" : "I'll arrive around 8pm"} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
            </Field>
            {!loggedIn && (
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 accent-brand-500" />
                Remember my details on this device
              </label>
            )}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="submit" size="lg" className="col-span-2">
                Review order
              </Button>
            </div>
          </form>
        )}

        {info && info.orderingEnabled && step === 2 && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Order from</div>
                  <div className="font-bold">{info.displayName}</div>
                </div>
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-bold">{method === "DELIVERY" ? "Delivery" : "Pickup"}</span>
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
                <Row label="Subtotal" value={quote ? formatMoney(subtotal, currency) : <Loader2 className="h-4 w-4 animate-spin" />} />
                {method === "DELIVERY" && <Row label="Delivery fee" value={fee == null ? "—" : fee === 0 ? "Free" : formatMoney(fee, currency)} />}
                <Row label="Total" value={total == null ? "—" : formatMoney(total, currency)} bold />
              </div>
            </div>

            <div className="card p-4 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{method === "DELIVERY" ? "Deliver to" : "Pickup by"}</div>
              <div className="font-semibold">
                {d.name} · {d.phone}
              </div>
              {method === "DELIVERY" && <div className="mt-1 text-ink-soft">{savedAddress ? `${savedAddress.label}: ${[savedAddress.area, savedAddress.address, savedAddress.building].filter(Boolean).join(", ")}` : [d.area, d.address, d.building].filter(Boolean).join(", ")}</div>}
              {d.notes && <div className="mt-1 text-xs text-ink-muted">Note: {d.notes}</div>}
              <button className="mt-2 text-xs font-semibold text-brand-600" onClick={() => setStep(1)}>
                Edit details
              </button>
            </div>

            <div className="card p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Payment</div>
              <div className="flex items-center gap-3 rounded-xl border-2 border-brand-500 bg-brand-50/40 p-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500 text-white">
                  <Banknote className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <div className="font-bold">{method === "DELIVERY" ? "Cash on delivery" : "Cash at pickup"}</div>
                  <div className="text-xs text-ink-muted">Pay {total == null ? "the total" : formatMoney(total, currency)} in cash when you receive your order</div>
                </div>
                <Check className="h-5 w-5 text-brand-600" />
              </div>
              <label className="mt-3 block">
                <span className="label">Paying with a bigger bill? (optional)</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">{unitLabel}</span>
                  <input className={cn("input", currency === "LBP" ? "pl-12" : "pl-8")} inputMode={minorDigits(currency) ? "decimal" : "numeric"} placeholder={currency === "LBP" ? "e.g. 1,000,000" : "e.g. 50"} value={changeFor} onChange={(e) => setChangeFor(e.target.value)} />
                </div>
                <span className="mt-1 block text-xs text-ink-muted">So the {method === "DELIVERY" ? "driver" : "restaurant"} can bring change.</span>
              </label>
            </div>

            {quoteChanged && (
              <Alert tone="amber">
                <AlertTriangle className="mr-1 inline h-4 w-4" /> Prices were updated by the restaurant. The totals above are the current prices.
              </Alert>
            )}
            {below && <Alert tone="amber">Minimum order is {formatMoney(info.minOrderCents!, currency)}.</Alert>}
            {placeError && <Alert tone="red">{placeError}</Alert>}
            <Button size="lg" block onClick={placeOrder} loading={placing} disabled={!quote || Object.keys(quote.errors).length > 0 || !!below || total == null}>
              Place order{total != null ? ` · ${formatMoney(total, currency)}` : ""}
            </Button>
            <p className="text-center text-xs text-ink-muted">
              By placing your order you agree to our <Link href="/terms" className="underline">terms</Link>. Your name, phone and address are shared with {info.displayName} to deliver your order.
            </p>
            {quote && Object.keys(quote.errors).length > 0 && (
              <Button variant="outline" block onClick={() => router.push("/cart")}>
                Fix cart
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
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-4 rounded-2xl border-2 bg-white p-4 text-left transition", active ? "border-brand-500 ring-4 ring-brand-500/10" : "border-transparent shadow-sm")}>
      <span className={cn("grid h-12 w-12 place-items-center rounded-xl", active ? "bg-brand-500 text-white" : "bg-black/5")}>{icon}</span>
      <span className="flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-ink-muted">{body}</span>
      </span>
      <span className={cn("grid h-6 w-6 place-items-center rounded-full border-2", active ? "border-brand-500 bg-brand-500 text-white" : "border-black/20")}>{active && <Check className="h-4 w-4" />}</span>
    </button>
  );
}
