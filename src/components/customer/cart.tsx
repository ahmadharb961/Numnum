"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { selectionSignature, type Selections } from "@/lib/customization";

export type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  unitBaseCents: number;
  unitOptionsCents: number;
  quantity: number;
  selections: Selections;
  summary: string[];
  note: string | null;
  reelId: string | null;
};

export type Cart = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  currency: string;
  lines: CartLine[];
};

type AddInput = Omit<CartLine, "key"> & { restaurant: { id: string; name: string; slug: string; currency: string } };

type CartCtx = {
  cart: Cart | null;
  count: number;
  subtotalCents: number;
  ready: boolean;
  /** Returns "conflict" when the item belongs to another restaurant (caller asks to replace). */
  add: (input: AddInput, opts?: { replace?: boolean }) => "added" | "conflict";
  updateQty: (key: string, qty: number) => void;
  updateLine: (key: string, patch: Partial<Omit<CartLine, "key">>) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Replaces the whole cart (used by "Order again"). */
  replaceWith: (restaurant: AddInput["restaurant"], lines: Omit<CartLine, "key">[]) => void;
};

const STORAGE_KEY = "nn_cart_v1";
const Ctx = createContext<CartCtx | null>(null);

function lineTotal(l: CartLine) {
  return Math.max(0, l.unitBaseCents + l.unitOptionsCents) * l.quantity;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {}
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCart(e.newValue ? JSON.parse(e.newValue) : null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: Cart | null) => {
    setCart(next);
    try {
      if (next && next.lines.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const add: CartCtx["add"] = useCallback(
    (input, opts) => {
      const { restaurant, ...line } = input;
      if (cart && cart.lines.length && cart.restaurantId !== restaurant.id && !opts?.replace) return "conflict";
      const base: Cart = cart && cart.restaurantId === restaurant.id && !opts?.replace ? cart : { restaurantId: restaurant.id, restaurantName: restaurant.name, restaurantSlug: restaurant.slug, currency: restaurant.currency, lines: [] };
      const key = selectionSignature(line.menuItemId, line.selections, line.note ?? "");
      const existing = base.lines.find((l) => l.key === key);
      const lines = existing
        ? base.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l))
        : [...base.lines, { ...line, key }];
      persist({ ...base, lines });
      return "added";
    },
    [cart, persist],
  );

  const value = useMemo<CartCtx>(
    () => ({
      cart,
      ready,
      count: cart?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0,
      subtotalCents: cart?.lines.reduce((s, l) => s + lineTotal(l), 0) ?? 0,
      add,
      updateQty: (key, qty) => cart && persist({ ...cart, lines: qty <= 0 ? cart.lines.filter((l) => l.key !== key) : cart.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, qty) } : l)) }),
      updateLine: (key, patch) => {
        if (!cart) return;
        const lines = cart.lines.map((l) => {
          if (l.key !== key) return l;
          const next = { ...l, ...patch };
          return { ...next, key: selectionSignature(next.menuItemId, next.selections, next.note ?? "") };
        });
        persist({ ...cart, lines });
      },
      remove: (key) => cart && persist({ ...cart, lines: cart.lines.filter((l) => l.key !== key) }),
      clear: () => persist(null),
      replaceWith: (restaurant, lines) => {
        const merged: CartLine[] = [];
        for (const l of lines) {
          const key = selectionSignature(l.menuItemId, l.selections, l.note ?? "");
          const ex = merged.find((m) => m.key === key);
          if (ex) ex.quantity = Math.min(50, ex.quantity + l.quantity);
          else merged.push({ ...l, key });
        }
        persist({ restaurantId: restaurant.id, restaurantName: restaurant.name, restaurantSlug: restaurant.slug, currency: restaurant.currency, lines: merged });
      },
    }),
    [cart, ready, add, persist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  // The cart lives in localStorage, so the server always renders "no cart yet". A component that
  // hydrates late (inside Suspense or a loading boundary) must still render that first, or React
  // throws a hydration error (#418) once the provider has already loaded the cart.
  const hydrated = useHydrated();
  return hydrated ? c : { ...c, cart: null, count: 0, subtotalCents: 0, ready: false };
}

export { lineTotal };

const noop = () => () => {};
/** False while hydrating, true afterwards (and on every client-side render). */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
