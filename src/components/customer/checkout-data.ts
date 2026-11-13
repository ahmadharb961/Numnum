"use client";

// Checkout needs the restaurant's delivery setup from the server. The cart loads it in the
// background, so checkout opens ready. A preloaded answer is used once and only for 30 seconds.
// (The customer's own details are not preloaded: they change when someone logs in or signs up
// between the cart and checkout, so checkout always asks for them fresh.)
const FRESH_MS = 30_000;
const early = new Map<string, { at: number; p: Promise<Response> }>();
const infoUrl = (restaurantId: string) => `/api/restaurants/${restaurantId}/checkout`;

export function preloadCheckout(restaurantId: string) {
  const url = infoUrl(restaurantId);
  const hit = early.get(url);
  if (hit && Date.now() - hit.at < FRESH_MS) return;
  const p = fetch(url);
  p.catch(() => early.delete(url));
  early.set(url, { at: Date.now(), p });
}

export function loadCheckoutInfo(restaurantId: string): Promise<Response> {
  const url = infoUrl(restaurantId);
  const hit = early.get(url);
  early.delete(url);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.p;
  return fetch(url);
}
