"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clock, Minus, Plus, Play } from "lucide-react";
import type { PublicItem } from "@/server/items";
import { validateSelections, unitPrice, effectiveBounds, type Selections } from "@/lib/customization";
import { formatMoney } from "@/lib/money";
import { cn, compactNumber, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RatingPill, Stars, VerifiedBadge, Badge } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useCart } from "./cart";
import { track } from "./track";

function defaultSelections(item: PublicItem): Selections {
  const s: Selections = {};
  for (const g of item.groups) {
    if (g.type === "TEXT") continue;
    const defs = g.options.filter((o) => o.isDefault && o.available).map((o) => o.id);
    if (defs.length) s[g.id] = g.type === "SINGLE" ? defs.slice(0, 1) : defs;
  }
  return s;
}

export function ItemDetail({ item, reelId, onAdded, compact, navOffset }: { item: PublicItem; reelId?: string | null; onAdded?: () => void; compact?: boolean; navOffset?: boolean }) {
  const cart = useCart();
  const toast = useToast();
  const [selections, setSelections] = useState<Selections>(() => defaultSelections(item));
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const groupsRef = useRef<HTMLDivElement>(null);

  const v = useMemo(() => validateSelections(item.groups, selections), [item.groups, selections]);
  const unit = unitPrice(item.priceCents, v.unitOptionsCents);
  const total = unit * qty;
  const canOrder = item.available && item.restaurant.orderingEnabled;

  function toggle(groupId: string, optionId: string, single: boolean, max: number) {
    setSelections((prev) => {
      const cur = Array.isArray(prev[groupId]) ? (prev[groupId] as string[]) : [];
      if (single) return { ...prev, [groupId]: cur[0] === optionId ? [] : [optionId] };
      if (cur.includes(optionId)) return { ...prev, [groupId]: cur.filter((x) => x !== optionId) };
      if (cur.length >= max) return prev;
      return { ...prev, [groupId]: [...cur, optionId] };
    });
  }

  function doAdd(replace = false) {
    if (!v.ok) {
      setShowErrors(true);
      const firstErr = Object.keys(v.errors)[0];
      document.getElementById(`grp-${firstErr}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const summary = v.chosen.map((c) => (c.optionId ? `${c.optionName}${c.priceDeltaCents ? ` (${c.priceDeltaCents > 0 ? "+" : "-"}${formatMoney(Math.abs(c.priceDeltaCents), item.currency)})` : ""}` : `${c.groupName}: ${c.optionName}`));
    const res = cart.add(
      {
        menuItemId: item.id,
        name: item.name,
        imageUrl: item.images[0]?.thumbUrl ?? item.images[0]?.url ?? null,
        unitBaseCents: item.priceCents,
        unitOptionsCents: v.unitOptionsCents,
        quantity: qty,
        selections,
        summary,
        note: note.trim() || null,
        reelId: reelId ?? null,
        restaurant: { id: item.restaurant.id, name: item.restaurant.name, slug: item.restaurant.slug, currency: item.currency },
      },
      { replace },
    );
    if (res === "conflict") return setConflict(true);
    setConflict(false);
    track("add_to_cart", { menuItemId: item.id, reelId: reelId ?? undefined, restaurantId: item.restaurant.id });
    toast(`Added ${qty} × ${item.name}`, "success");
    onAdded?.();
  }

  return (
    <div className={navOffset ? "pb-48" : "pb-28"}>
      {/* Gallery */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/5">
        {item.images.length ? (
          <>
            <div
              className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                setImgIdx(Math.round(el.scrollLeft / el.clientWidth));
              }}
            >
              {item.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={img.url} alt={`${item.name} photo ${i + 1}`} className="h-full w-full shrink-0 snap-center object-cover" loading={i === 0 ? "eager" : "lazy"} />
              ))}
            </div>
            {item.images.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {item.images.map((_, i) => (
                  <span key={i} className={cn("h-1.5 rounded-full bg-white/90 transition-all", i === imgIdx ? "w-5" : "w-1.5 opacity-60")} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center text-5xl">🍽️</div>
        )}
      </div>

      <div className="px-5 pt-4">
        <Link href={`/r/${item.restaurant.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
          {item.restaurant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.restaurant.logoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          )}
          {item.restaurant.name}
          {item.restaurant.verified && <VerifiedBadge />}
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight">{item.name}</h2>
          <div className="tabular shrink-0 pt-0.5 text-xl font-extrabold text-brand-600">{formatMoney(item.priceCents, item.currency)}</div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <RatingPill avg={item.ratingAvg} count={item.ratingCount} />
          {item.prepTimeMinutes ? (
            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <Clock className="h-3.5 w-3.5" /> ~{item.prepTimeMinutes} min
            </span>
          ) : null}
          {item.dietaryLabels.map((d) => (
            <Badge key={d} tone="green">
              {d}
            </Badge>
          ))}
          {!item.available && <Badge tone="red">Currently unavailable</Badge>}
        </div>
        {item.description && <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{item.description}</p>}
        {item.ingredients && (
          <div className="mt-4">
            <h3 className="text-sm font-bold">Ingredients</h3>
            <p className="mt-1 text-sm text-ink-soft">{item.ingredients}</p>
          </div>
        )}
        {item.allergens && (
          <div className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            <span className="font-bold">Allergens: </span>
            {item.allergens}
            <div className="mt-0.5 text-xs text-amber-800/80">Provided by the restaurant. Confirm with them if you have a severe allergy.</div>
          </div>
        )}

        {item.reels.length > 0 && !compact && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-bold">Reels</h3>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {item.reels.map((r) => (
                <Link key={r.id} href={`/reel/${r.id}`} className="relative aspect-[9/16] w-24 shrink-0 overflow-hidden rounded-xl bg-black">
                  {r.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  <span className="absolute bottom-1 left-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-white text-shadow">
                    <Play className="h-3 w-3 fill-white" />
                    {compactNumber(r.viewCount)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Customizations */}
        <div ref={groupsRef} className="mt-6 space-y-5">
          {item.groups.map((g) => {
            const { min, max } = effectiveBounds(g);
            const err = showErrors ? v.errors[g.id] : undefined;
            const cur = Array.isArray(selections[g.id]) ? (selections[g.id] as string[]) : [];
            if (g.type === "TEXT") {
              return (
                <div key={g.id} id={`grp-${g.id}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-bold">{g.name}</h3>
                    <span className={cn("text-xs font-semibold", g.required ? "text-brand-600" : "text-ink-muted")}>{g.required ? "Required" : "Optional"}</span>
                  </div>
                  <textarea className="input" maxLength={300} placeholder="Type here…" value={(selections[g.id] as string) ?? ""} onChange={(e) => setSelections((p) => ({ ...p, [g.id]: e.target.value }))} />
                  {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
                </div>
              );
            }
            return (
              <div key={g.id} id={`grp-${g.id}`} className={cn("rounded-2xl transition", err && "ring-2 ring-red-500/60 ring-offset-4")}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">{g.name}</h3>
                    <p className="text-xs text-ink-muted">{g.type === "SINGLE" ? "Choose 1" : min > 0 ? `Choose ${min}${max > min ? `–${max}` : ""}` : `Choose up to ${max}`}</p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", min > 0 ? (v.errors[g.id] ? "bg-brand-500 text-white" : "bg-emerald-50 text-emerald-700") : "bg-black/5 text-ink-muted")}>
                    {min > 0 ? (v.errors[g.id] ? "Required" : "Done") : "Optional"}
                  </span>
                </div>
                <div className="divide-y divide-black/5 rounded-2xl border border-black/10 bg-white">
                  {g.options.map((o) => {
                    const checked = cur.includes(o.id);
                    const disabled = !o.available || (!checked && g.type === "MULTIPLE" && cur.length >= max);
                    return (
                      <button key={o.id} type="button" disabled={disabled} onClick={() => toggle(g.id, o.id, g.type === "SINGLE", max)} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-40">
                        <span className={cn("grid h-6 w-6 shrink-0 place-items-center border-2 transition", g.type === "SINGLE" ? "rounded-full" : "rounded-md", checked ? "border-brand-500 bg-brand-500 text-white" : "border-black/20")}>
                          {checked && <Check className="h-4 w-4 stroke-[3]" />}
                        </span>
                        <span className="flex-1 text-[15px] font-medium">
                          {o.name}
                          {!o.available && <span className="ml-2 text-xs text-ink-muted">Unavailable</span>}
                        </span>
                        {o.priceDeltaCents !== 0 && (
                          <span className="tabular text-sm font-semibold text-ink-soft">
                            {o.priceDeltaCents > 0 ? "+" : "-"}
                            {formatMoney(Math.abs(o.priceDeltaCents), item.currency)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {err && <p className="mt-1.5 text-xs font-medium text-red-600">{err}</p>}
              </div>
            );
          })}
          {canOrder && (
            <div>
              <h3 className="mb-2 font-bold">Special instructions</h3>
              <textarea className="input" maxLength={300} placeholder="E.g. no onions, extra crispy" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
        </div>

        {/* Reviews */}
        {!compact && <ItemReviews item={item} />}
        {compact && (
          <Link href={`/item/${item.id}`} className="mt-6 block text-center text-sm font-semibold text-brand-600">
            See full details & reviews
          </Link>
        )}
      </div>

      {/* Sticky add bar */}
      <div
        className="fixed inset-x-0 z-40 mx-auto max-w-screen-sm border-t lg:left-64 border-black/5 bg-white/95 px-4 pt-3 backdrop-blur"
        style={navOffset ? { bottom: "calc(var(--nav-h) + var(--safe-bottom))", paddingBottom: 12 } : { bottom: 0, paddingBottom: "calc(var(--safe-bottom) + 12px)" }}
      >
        {canOrder ? (
          <div className="flex items-center gap-3">
            <div className="flex h-14 items-center rounded-2xl bg-black/5">
              <button className="grid h-14 w-12 place-items-center" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
                <Minus className="h-5 w-5" />
              </button>
              <span className="tabular w-6 text-center text-lg font-bold">{qty}</span>
              <button className="grid h-14 w-12 place-items-center" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="Increase quantity">
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <Button size="lg" className="flex-1" onClick={() => doAdd(false)} aria-disabled={!v.ok}>
              <span>Add to cart</span>
              <span className="tabular opacity-90">· {formatMoney(total, item.currency)}</span>
            </Button>
          </div>
        ) : (
          <div className="py-3 text-center text-sm font-semibold text-ink-muted">{!item.available ? "This item is currently unavailable" : "This restaurant isn't taking online orders right now"}</div>
        )}
      </div>

      <Sheet open={conflict} onClose={() => setConflict(false)} title="Start a new cart?">
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-soft">
            Your cart has items from <b>{cart.cart?.restaurantName}</b>. Each order goes to one restaurant. Replace your cart with this item from <b>{item.restaurant.name}</b>?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setConflict(false)}>
              Keep cart
            </Button>
            <Button onClick={() => doAdd(true)}>Replace cart</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function ItemReviews({ item }: { item: PublicItem }) {
  const max = Math.max(1, ...item.distribution.map((d) => d.count));
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold">Reviews</h3>
        <Link href={`/item/${item.id}/review`} className="text-sm font-semibold text-brand-600">
          Write a review
        </Link>
      </div>
      {item.ratingCount > 0 ? (
        <div className="mt-3 flex gap-5 rounded-2xl bg-white p-4">
          <div className="text-center">
            <div className="text-4xl font-extrabold">{item.ratingAvg.toFixed(1)}</div>
            <Stars value={item.ratingAvg} />
            <div className="mt-1 text-xs text-ink-muted">{item.ratingCount} reviews</div>
          </div>
          <div className="flex-1 space-y-1">
            {item.distribution.map((d) => (
              <div key={d.stars} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-ink-muted">{d.stars}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${(d.count / max) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-ink-muted">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">No reviews yet. Be the first to review this dish.</p>
      )}
      <ul className="mt-3 space-y-3">
        {item.reviews.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">{r.userName}</div>
              <div className="text-xs text-ink-muted">{formatDate(r.createdAt)}</div>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <Stars value={r.rating} size={13} />
              {r.evidence !== "UNVERIFIED" && <Badge tone="green">{r.evidence === "COMPLETED_ORDER" ? "Verified order" : "Ordered on numnum"}</Badge>}
            </div>
            {r.body && <p className="mt-2 text-sm text-ink-soft">{r.body}</p>}
            {r.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.photoUrl} alt="Review photo" className="mt-2 h-28 w-28 rounded-xl object-cover" loading="lazy" />
            )}
            {r.reply && (
              <div className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm">
                <div className="text-xs font-bold text-ink-soft">Reply from {item.restaurant.name}</div>
                <p className="mt-0.5 text-ink-soft">{r.reply}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
