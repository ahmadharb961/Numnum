"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import type { PublicItem } from "@/server/items";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/misc";
import { ItemDetail } from "./item-detail";
import { track } from "./track";

const cache = new Map<string, PublicItem>();
const fetchedAt = new Map<string, number>();
const inflight = new Map<string, Promise<PublicItem>>();

function load(itemId: string): Promise<PublicItem> {
  const running = inflight.get(itemId);
  if (running) return running;
  const p = fetch(`/api/items/${itemId}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Item not available"))))
    .then((d: PublicItem) => {
      cache.set(itemId, d);
      fetchedAt.set(itemId, Date.now());
      return d;
    })
    .finally(() => inflight.delete(itemId));
  inflight.set(itemId, p);
  return p;
}

/**
 * Loads a dish in the background (details + main photo) so its sheet opens instantly: called for
 * the reel on screen and the next one, and when a finger touches a dish on a menu.
 */
export function prefetchItem(itemId: string | null | undefined) {
  if (!itemId || typeof window === "undefined") return;
  if (inflight.has(itemId) || Date.now() - (fetchedAt.get(itemId) ?? 0) < 60_000) return;
  void load(itemId)
    .then((d) => {
      const img = d.images?.[0]?.url;
      if (img) new Image().src = img; // the photo is in the browser before the sheet opens
    })
    .catch(() => {});
}

export function ItemSheet({ itemId, reelId, open, onClose }: { itemId: string | null; reelId?: string | null; open: boolean; onClose: () => void }) {
  const t = useT();
  const [item, setItem] = useState<PublicItem | null>(itemId ? cache.get(itemId) ?? null : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemId) return;
    setError(null);
    track("product_opened", { menuItemId: itemId, reelId: reelId ?? undefined });
    // Show the remembered (usually prefetched) copy instantly; refresh it if it's more than a few
    // seconds old: restaurants change photos, prices and availability while the app stays open.
    const cached = cache.get(itemId);
    setItem(cached ?? null);
    let cancelled = false;
    const fresh = cached && Date.now() - (fetchedAt.get(itemId) ?? 0) < 15_000;
    if (fresh) return;
    load(itemId)
      .then((d: PublicItem) => {
        if (!cancelled) setItem(d);
      })
      .catch((e) => {
        if (!cancelled && !cached) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemId, reelId]);

  return (
    <Sheet open={open} onClose={onClose} full>
      {item ? (
        <ItemDetail item={item} reelId={reelId} onAdded={onClose} compact />
      ) : (
        <div className="grid h-full place-items-center p-10 text-ink-muted">{error ? t(error) : <Spinner className="text-brand-500" />}</div>
      )}
    </Sheet>
  );
}
