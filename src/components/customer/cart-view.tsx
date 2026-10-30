"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart, lineTotal } from "./cart";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { track } from "./track";
import { useEffect } from "react";

export function CartView() {
  const { cart, ready, subtotalCents, updateQty, remove, clear } = useCart();
  const router = useRouter();
  useEffect(() => {
    if (cart?.lines.length) track("cart_reviewed", { restaurantId: cart.restaurantId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="pb-nav">
      <header className="container-app flex items-end justify-between pb-3" style={{ paddingTop: "calc(var(--safe-top) + 14px)" }}>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Your cart</h1>
          {cart && (
            <Link href={`/r/${cart.restaurantSlug}`} className="text-sm font-semibold text-brand-600">
              {cart.restaurantName}
            </Link>
          )}
        </div>
        {cart && cart.lines.length > 0 && (
          <button onClick={() => confirm("Clear your cart?") && clear()} className="text-sm font-semibold text-ink-muted">
            Clear
          </button>
        )}
      </header>
      {!ready ? (
        <div className="grid place-items-center py-20">
          <Spinner className="text-brand-500" />
        </div>
      ) : !cart || !cart.lines.length ? (
        <EmptyState icon={<ShoppingBag />} title="Your cart is empty" body="Find something delicious in the reels and tap Order." action={<Link href="/" className="chip chip-active">Watch reels</Link>} />
      ) : (
        <div className="container-app">
          <ul className="space-y-2.5">
            {cart.lines.map((l) => (
              <li key={l.key} className="card flex gap-3 p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/5">
                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-2xl">🍽️</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/item/${l.menuItemId}`} className="font-bold leading-tight">
                      {l.name}
                    </Link>
                    <span className="tabular shrink-0 font-bold">{formatMoney(lineTotal(l), cart.currency)}</span>
                  </div>
                  {l.summary.length > 0 && <p className="mt-0.5 text-xs text-ink-muted">{l.summary.join(" · ")}</p>}
                  {l.note && <p className="mt-0.5 text-xs italic text-ink-muted">“{l.note}”</p>}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center rounded-xl bg-black/5">
                      <button className="grid h-9 w-9 place-items-center" onClick={() => updateQty(l.key, l.quantity - 1)} aria-label="Decrease">
                        {l.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                      </button>
                      <span className="tabular w-6 text-center text-sm font-bold">{l.quantity}</span>
                      <button className="grid h-9 w-9 place-items-center" onClick={() => updateQty(l.key, l.quantity + 1)} aria-label="Increase">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex gap-3 text-xs font-semibold">
                      <Link href={`/item/${l.menuItemId}`} className="text-brand-600">
                        Edit
                      </Link>
                      <button onClick={() => remove(l.key)} className="text-ink-muted">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Link href={`/r/${cart.restaurantSlug}`} className="mt-3 flex h-12 items-center justify-center rounded-2xl border border-dashed border-black/15 text-sm font-semibold text-ink-soft">
            + Add more from {cart.restaurantName}
          </Link>
          <div className="card mt-4 space-y-1.5 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Item subtotal</span>
              <span className="tabular font-bold">{formatMoney(subtotalCents, cart.currency)}</span>
            </div>
            <div className="flex justify-between text-ink-muted">
              <span>Delivery fee</span>
              <span>Shown at checkout</span>
            </div>
            <p className="pt-1 text-xs text-ink-muted">💵 Pay cash on delivery — no card needed.</p>
          </div>
          <div className="sticky mt-4" style={{ bottom: "calc(var(--nav-h) + var(--safe-bottom) + 12px)" }}>
            <Button size="lg" block onClick={() => router.push("/checkout")}>
              Continue to checkout · {formatMoney(subtotalCents, cart.currency)}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
