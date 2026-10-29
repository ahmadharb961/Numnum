"use client";

import { useEffect, useState } from "react";
import type { PublicItem } from "@/server/items";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/misc";
import { ItemDetail } from "./item-detail";
import { track } from "./track";

const cache = new Map<string, PublicItem>();

export function ItemSheet({ itemId, reelId, open, onClose }: { itemId: string | null; reelId?: string | null; open: boolean; onClose: () => void }) {
  const [item, setItem] = useState<PublicItem | null>(itemId ? cache.get(itemId) ?? null : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemId) return;
    setError(null);
    track("product_opened", { menuItemId: itemId, reelId: reelId ?? undefined });
    if (cache.has(itemId)) {
      setItem(cache.get(itemId)!);
      return;
    }
    setItem(null);
    fetch(`/api/items/${itemId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Item not available"))))
      .then((d: PublicItem) => {
        cache.set(itemId, d);
        setItem(d);
      })
      .catch((e) => setError(e.message));
  }, [open, itemId, reelId]);

  return (
    <Sheet open={open} onClose={onClose} full>
      {item ? (
        <ItemDetail item={item} reelId={reelId} onAdded={onClose} compact />
      ) : (
        <div className="grid h-full place-items-center p-10 text-ink-muted">{error ?? <Spinner className="text-brand-500" />}</div>
      )}
    </Sheet>
  );
}
