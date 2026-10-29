"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Check, Loader2, LocateFixed, MapPin, MessageCircle, ShoppingBag, AlertTriangle } from "lucide-react";
import { useCart, lineTotal } from "./cart";
import { formatMoney } from "@/lib/money";
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
  currency: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  requireMapsLocation: boolean;
  deliveryFeeCents: number | null;
  minOrderCents: number | null;
  orderingEnabled: boolean;
  deliveryAreas: { name: string; feeCents: number | null }[];
};

type Quote = { subtotalCents: number; currency: string; errors: Record<string, string>; lines: { menuItemId: string; name: string; quantity: number; unitTotalCents: number; lineTotalCents: number }[] };

type Details = { name: string; phone: string; address: string; building: string; area: string; notes: string; mapsUrl: string; latitude: number | null; longitude: number | null };

const DETAILS_KEY = "nn_details_v1";
const STEPS = ["Method", "Details", "Confirm"] as const;

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
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"DELIVERY" | "PICKUP" | null>(null);
  const [d, setD] = useState<Details>({ name: "", phone: "", address: "", building: "", area: "", notes: "", mapsUrl: "", latitude: null, longitude: null });
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DETAILS_KEY);
      if (saved) {
        setD((p) => ({ ...p, ...JSON.parse(saved) }));
        setRemember(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!cart) return;
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

  const area = info?.deliveryAreas.find((a) => a.name === d.area);
  const deliveryFee = method === "DELIVERY" ? (area ? area.feeCents : info?.deliveryAreas.length ? null : info?.deliveryFeeCents ?? null) : null;

  // Idempotency key per checkout attempt: survives refresh & double taps; a new cart gets a new key.
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

  function validateDetails() {
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = "Enter your full name";
    const p = normalizePhone(d.phone);
    if (!p.ok) e.phone = p.error;
    if (method === "DELIVERY") {
      if (info?.deliveryAreas.length && !d.area) e.area = "Choose your area";
      if (d.address.trim().length < 4) e.address = "Enter your delivery address";
      if (info?.requireMapsLocation && !d.mapsUrl && d.latitude == null) e.mapsUrl = "This restaurant needs your Google Maps location";
    }
    if (d.mapsUrl && !/^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(d.mapsUrl)) e.mapsUrl = "Paste a Google Maps link (maps.google.com or maps.app.goo.gl)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function goConfirm() {
    if (!validateDetails()) return;
    try {
      if (remember) localStorage.setItem(DETAILS_KEY, JSON.stringify({ name: d.name, phone: d.phone, address: d.address, building: d.building, area: d.area }));
      else localStorage.removeItem(DETAILS_KEY);
    } catch {}
    track("order_details_completed", { restaurantId: cart!.restaurantId });
    setStep(2);
    setQuote(null);
    try {
      setQuote(await api<Quote>("/api/cart/quote", { restaurantId: cart!.restaurantId, items }));
    } catch (e) {
      setSendError((e as Error).message);
    }
  }

  function locate() {
    if (!navigator.geolocation) return setErrors((e) => ({ ...e, mapsUrl: "Location isn't available on this device" }));
    setConsented(true);
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

  async function send() {
    setSending(true);
    setSendError(null);
    try {
      const order = await api<{ reference: string; whatsappUrl: string }>("/api/orders", {
        idempotencyKey: idemKey,
        restaurantId: cart!.restaurantId,
        fulfillment: method,
        items,
        customer: {
          name: d.name.trim(),
          phone: d.phone,
          address: method === "DELIVERY" ? d.address.trim() : null,
          building: method === "DELIVERY" ? d.building.trim() || null : null,
          area: method === "DELIVERY" ? d.area || null : null,
          notes: d.notes.trim() || null,
          mapsUrl: d.latitude == null ? d.mapsUrl || null : null,
          latitude: d.latitude,
          longitude: d.longitude,
        },
      });
      // Record the handoff attempt (not proof of sending), then hand over to WhatsApp.
      try {
        await api(`/api/orders/${order.reference}/handoff`);
      } catch {}
      try {
        const recent = JSON.parse(localStorage.getItem("nn_recent_orders") || "[]") as string[];
        localStorage.setItem("nn_recent_orders", JSON.stringify([order.reference, ...recent.filter((r) => r !== order.reference)].slice(0, 10)));
        sessionStorage.removeItem("nn_idem");
      } catch {}
      clear();
      window.history.replaceState(null, "", `/order/${order.reference}?sent=1`);
      window.location.assign(order.whatsappUrl);
    } catch (e) {
      const err = e as Error & { fieldErrors?: Record<string, string> };
      setSendError(err.message + (err.fieldErrors ? `: ${Object.values(err.fieldErrors)[0]}` : ""));
      setSending(false);
    }
  }

  const currency = cart.currency;
  const subtotal = quote?.subtotalCents ?? localSubtotal;
  const quoteChanged = quote && quote.subtotalCents !== localSubtotal;
  const below = info?.minOrderCents && subtotal < info.minOrderCents;

  return (
    <main className="pb-nav">
      <PageHeader title="Checkout" sub={cart.restaurantName} />
      <div className="container-app pt-4">
        <ol className="mb-5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", i < step ? "bg-emerald-500 text-white" : i === step ? "bg-ink text-white" : "bg-black/10 text-ink-muted")}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>
              <span className={cn("text-sm font-semibold", i === step ? "text-ink" : "text-ink-muted")}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-black/10" />}
            </li>
          ))}
        </ol>

        {infoError && <Alert tone="red">{infoError}</Alert>}
        {info && !info.orderingEnabled && <Alert tone="amber">{info.displayName} hasn't enabled WhatsApp ordering yet.</Alert>}

        {!info && !infoError && (
          <div className="grid place-items-center py-16">
            <Spinner className="text-brand-500" />
          </div>
        )}

        {info && info.orderingEnabled && step === 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold">How would you like your order?</h2>
            {info.deliveryEnabled && (
              <MethodCard active={method === "DELIVERY"} onClick={() => setMethod("DELIVERY")} icon={<Bike className="h-6 w-6" />} title="Delivery" body={info.deliveryFeeCents != null && !info.deliveryAreas.length ? `Delivery fee ${formatMoney(info.deliveryFeeCents, currency)}` : "The restaurant confirms the delivery fee"} />
            )}
            {info.pickupEnabled && <MethodCard active={method === "PICKUP"} onClick={() => setMethod("PICKUP")} icon={<ShoppingBag className="h-6 w-6" />} title="Pickup" body="Collect your order from the restaurant" />}
            <Button size="lg" block disabled={!method} onClick={() => setStep(1)} className="mt-4">
              Continue
            </Button>
          </div>
        )}

        {info && info.orderingEnabled && step === 1 && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void goConfirm();
            }}
            noValidate
          >
            <h2 className="text-lg font-extrabold">{method === "DELIVERY" ? "Delivery details" : "Pickup details"}</h2>
            <Field label="Full name" error={errors.name} htmlFor="name">
              <input id="name" className="input" autoComplete="name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
            <Field label="Phone number" error={errors.phone} hint="Lebanese numbers like 70 123 456, or include your country code" htmlFor="phone">
              <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="70 123 456" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
            </Field>
            {method === "DELIVERY" && (
              <>
                {info.deliveryAreas.length > 0 && (
                  <Field label="Area" error={errors.area} htmlFor="area">
                    <select id="area" className="input" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })}>
                      <option value="">Choose your area</option>
                      {info.deliveryAreas.map((a) => (
                        <option key={a.name} value={a.name}>
                          {a.name}
                          {a.feeCents != null ? ` · ${formatMoney(a.feeCents, currency)}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Delivery address" error={errors.address} htmlFor="address">
                  <textarea id="address" className="input min-h-[80px]" autoComplete="street-address" placeholder="Street, landmark, city" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
                </Field>
                <Field label="Building & floor (optional)" htmlFor="building">
                  <input id="building" className="input" placeholder="Bldg. Azar, 3rd floor" value={d.building} onChange={(e) => setD({ ...d, building: e.target.value })} />
                </Field>
              </>
            )}
            <div>
              <div className="label">
                Google Maps location {info.requireMapsLocation && method === "DELIVERY" ? <span className="text-brand-600">(required)</span> : <span className="font-normal text-ink-muted">(optional)</span>}
              </div>
              {!consented && d.latitude == null && <p className="mb-2 text-xs text-ink-muted">We only use your location to create a map link for the restaurant. It's sent in your WhatsApp message and not used for anything else.</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={locate} loading={locating} className="shrink-0">
                  <LocateFixed className="h-4 w-4" /> Use my location
                </Button>
                <input className="input" placeholder="or paste a Google Maps link" value={d.latitude != null ? "" : d.mapsUrl} onChange={(e) => setD({ ...d, mapsUrl: e.target.value, latitude: null, longitude: null })} />
              </div>
              {d.latitude != null && (
                <div className="mt-2 overflow-hidden rounded-xl border border-black/10">
                  {mapsKey ? (
                    <iframe title="Your location" className="h-40 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${d.latitude},${d.longitude}&zoom=16`} />
                  ) : (
                    <iframe title="Your location" className="h-40 w-full" loading="lazy" src={`https://maps.google.com/maps?q=${d.latitude},${d.longitude}&z=16&output=embed`} />
                  )}
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
            <Field label={method === "DELIVERY" ? "Delivery notes (optional)" : "Pickup instructions (optional)"} htmlFor="notes">
              <textarea id="notes" className="input min-h-[72px]" maxLength={400} placeholder={method === "DELIVERY" ? "Ring the bell twice, call on arrival…" : "I'll arrive around 8pm"} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 accent-brand-500" />
              Remember my details on this device
            </label>
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
            <h2 className="text-lg font-extrabold">Confirm your order</h2>
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Restaurant</div>
              <div className="font-bold">{info.displayName}</div>
              <div className="mt-3 divide-y divide-black/5">
                {cart.lines.map((l, i) => {
                  const q = quote?.lines[i];
                  return (
                    <div key={l.key} className="py-2.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="font-semibold">
                          {l.quantity} × {l.name}
                        </span>
                        <span className="tabular font-semibold">{formatMoney(q?.lineTotalCents ?? lineTotal(l), currency)}</span>
                      </div>
                      {l.summary.length > 0 && <div className="mt-0.5 text-xs text-ink-muted">{l.summary.join(" · ")}</div>}
                      {l.note && <div className="mt-0.5 text-xs italic text-ink-muted">“{l.note}”</div>}
                      {quote?.errors[`items.${i}`] && <div className="mt-1 text-xs font-semibold text-red-600">{quote.errors[`items.${i}`]}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 space-y-1.5 border-t border-black/10 pt-3 text-sm">
                <Row label="Item subtotal" value={quote ? formatMoney(subtotal, currency) : <Loader2 className="h-4 w-4 animate-spin" />} bold />
                {method === "DELIVERY" && <Row label="Delivery fee" value={deliveryFee != null ? formatMoney(deliveryFee, currency) : "To be confirmed"} />}
                <Row label="Final total" value={method === "PICKUP" ? formatMoney(subtotal, currency) : deliveryFee != null ? formatMoney(subtotal + deliveryFee, currency) : "To be confirmed"} bold />
              </div>
              {method === "DELIVERY" && deliveryFee == null && <p className="mt-2 text-xs text-ink-muted">The restaurant will confirm the delivery fee and final payable amount on WhatsApp.</p>}
            </div>
            {quoteChanged && (
              <Alert tone="amber">
                <AlertTriangle className="mr-1 inline h-4 w-4" /> Prices were updated by the restaurant. The totals above are the current prices.
              </Alert>
            )}
            {below && <Alert tone="amber">Minimum order is {formatMoney(info.minOrderCents!, currency)}.</Alert>}
            <div className="card p-4 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{method === "DELIVERY" ? "Delivery to" : "Pickup by"}</div>
              <div className="font-semibold">{d.name}</div>
              <div>{d.phone}</div>
              {method === "DELIVERY" && (
                <div className="mt-1 text-ink-soft">
                  {[d.area, d.address, d.building].filter(Boolean).join(", ")}
                </div>
              )}
              {(d.mapsUrl || d.latitude != null) && <div className="mt-1 text-xs text-emerald-700">📍 Google Maps location included</div>}
              {d.notes && <div className="mt-1 text-xs text-ink-muted">Note: {d.notes}</div>}
              <button className="mt-2 text-xs font-semibold text-brand-600" onClick={() => setStep(1)}>
                Edit details
              </button>
            </div>
            {sendError && <Alert tone="red">{sendError}</Alert>}
            <p className="text-xs leading-relaxed text-ink-muted">
              Tapping the button opens WhatsApp with your order pre-written to {info.displayName}. <b>Press Send in WhatsApp</b> to place it. Your name, phone, address and location are shared with the restaurant. There's no online payment — pay the restaurant directly. See our{" "}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </p>
            <Button size="lg" block onClick={send} loading={sending} disabled={!quote || Object.keys(quote.errors).length > 0 || !!below} className="bg-[#25D366] shadow-[#25D366]/30 hover:bg-[#1ebe5b]">
              <MessageCircle className="h-5 w-5" /> Send order via WhatsApp
            </Button>
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
      <span className="text-ink-muted">{label}</span>
      <span className={cn("tabular", bold && "font-bold")}>{value}</span>
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
