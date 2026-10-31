"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import type { PublicItem } from "@/server/items";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/misc";
import { ItemDetail } from "./item-detail";
import { track } from "./track";

const cache = new Map<string, PublicItem>();

export function ItemSheet({ itemId, reelId, open, onClose }: { itemId: string | null; reelId?: string | null; open: boolean; onClose: () => void }) {
  const t = useT();
  const [item, setItem] = useState<PublicItem | null>(itemId ? cache.get(itemId) ?? null : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemId) return;
    setError(null);
    track("product_opened", { menuItemId: itemId, reelId: reelId ?? undefined });
    // Show the remembered copy instantly, but always refresh it: restaurants change photos,
    // prices and availability while the app stays open.
    const cached = cache.get(itemId);
    setItem(cached ?? null);
    let cancelled = false;
    fetch(`/api/items/${itemId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Item not available"))))
      .then((d: PublicItem) => {
        cache.set(itemId, d);
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
