"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgePercent, Check, Store, UserPlus } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { setFollowing, useFollowState } from "./follow-store";

type Item = { id: string; slug: string; name: string; logoUrl: string | null; place: string; verified: boolean; followerCount: number; deal: string | null };

export function FollowingList({ items }: { items: Item[] }) {
  const t = useT();
  // Unfollowing refreshes the page from the server, which no longer lists that restaurant; keep the
  // rows shown on screen so it stays with a "Follow" button (a mis-tap can be undone), and add any
  // newly followed ones.
  const [rows, setRows] = useState(items);
  useEffect(() => {
    setRows((prev) => {
      const known = new Set(prev.map((r) => r.id));
      const added = items.filter((r) => !known.has(r.id));
      return added.length ? [...added, ...prev] : prev;
    });
  }, [items]);
  if (!rows.length)
    return (
      <div className="pt-12 text-center" data-testid="following-list-empty">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-500">
          <UserPlus className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-black tracking-tight">{t("You're not following any restaurants yet")}</h2>
        <p className="mx-auto mt-2 max-w-sm text-ink-muted">{t("Tap + on a restaurant's picture in any reel. Their new reels and deals show up here, and we'll let you know.")}</p>
        <div className="mx-auto mt-6 grid max-w-xs gap-3">
          <Link href="/" className={buttonClass("primary", "lg")}>
            {t("Discover reels")}
          </Link>
          <Link href="/restaurants" className={buttonClass("outline", "lg")}>
            {t("Browse restaurants")}
          </Link>
        </div>
      </div>
    );
  return (
    <ul className="card divide-y divide-black/5" data-testid="following-list">
      {rows.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </ul>
  );
}

function Row({ r }: { r: Item }) {
  const t = useT();
  const toast = useToast();
  // Shared follow state: unfollowing here also updates the reels and the restaurant page.
  const { following } = useFollowState(r.id, true, r.followerCount);
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center gap-3 p-3" data-testid="following-row">
      <Link href={`/r/${r.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
          {r.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Store className="h-6 w-6" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 font-bold">
            <span className="truncate">{r.name}</span>
            {r.verified && <VerifiedBadge />}
          </span>
          {r.place && <span className="block truncate text-xs text-ink-muted">{r.place}</span>}
          {r.deal && (
            <span className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              <BadgePercent className="h-3 w-3 shrink-0" />
              <span className="truncate">{r.deal}</span>
            </span>
          )}
        </span>
      </Link>
      <button
        disabled={busy}
        aria-pressed={following}
        onClick={async () => {
          setBusy(true);
          const res = await setFollowing(r.id, !following);
          setBusy(false);
          if (res === "error") toast(t("Couldn't update. Check your connection."), "error");
        }}
        className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-bold transition active:scale-95", following ? "bg-black/5 text-ink" : "bg-brand-500 text-white")}
        data-testid="following-toggle"
      >
        {following ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {following ? t("Following") : t("Follow")}
      </button>
    </li>
  );
}
