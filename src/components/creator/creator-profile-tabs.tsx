"use client";

import { useEffect, useState } from "react";
import Link from "@/components/link";
import { Bookmark, Copy, MoreHorizontal, Pencil, Pin, PlayCircle, Users } from "lucide-react";
import { ReelThumb } from "@/components/customer/cards";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type GridReel = { id: string; posterUrl: string | null; viewCount: number; pinned?: boolean; label: string };

/** Reels | Favorites on a creator's profile. The open tab is kept in the link (#favorites), so Back returns to it. */
export function CreatorProfileTabs({ handle, reels, favorites, self }: { handle: string; reels: GridReel[]; favorites: GridReel[]; self: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<"reels" | "favorites">("reels");
  useEffect(() => {
    if (location.hash === "#favorites") setTab("favorites");
  }, []);
  const pick = (k: "reels" | "favorites") => {
    setTab(k);
    history.replaceState(history.state, "", k === "favorites" ? "#favorites" : location.pathname + location.search);
  };
  const list = tab === "reels" ? reels : favorites;
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 border-b border-black/5" role="tablist">
        {(
          [
            ["reels", t("Reels"), PlayCircle],
            ["favorites", t("Favorites"), Bookmark],
          ] as const
        ).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pick(k)} className={cn("relative flex h-12 items-center justify-center gap-2 text-[15px] font-bold transition", tab === k ? "text-brand-600" : "text-ink-soft")} data-testid={`creator-tab-${k}`}>
            <Icon className="h-5 w-5" /> {label}
            {tab === k && <span className="absolute inset-x-[18%] bottom-0 h-[3px] rounded-full bg-brand-500" />}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5" data-testid={tab === "reels" ? "creator-grid" : "creator-favorites"}>
          {list.map((r) => (
            <div key={r.id} className="relative" data-pinned={r.pinned ? "true" : undefined}>
              <ReelThumb href={`/c/${handle}/${tab === "reels" ? "reels" : "favorites"}/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} label={r.label} className="rounded-xl" />
              {r.pinned && (
                <span className="pointer-events-none absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
                  <Pin className="h-3 w-3" /> {t("Pinned")}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-center text-ink-muted" data-testid={tab === "favorites" ? "favorites-empty" : undefined}>
          {tab === "reels" ? t("No reels yet.") : self ? t("Reels you save show here, so your followers see your favorite food.") : t("No favorites yet.")}
        </p>
      )}
      {tab === "favorites" && self && favorites.length > 0 && <p className="mt-3 text-center text-xs text-ink-muted">{t("Everyone can see the reels you save here.")}</p>}
    </div>
  );
}

/** "…" on a creator's profile: copy the link; on your own profile, edit it and see your followers. */
export function CreatorMoreMenu({ handle, self }: { handle: string; self: boolean }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const row = "flex h-14 w-full items-center gap-3 rounded-2xl bg-black/5 px-4 text-base font-bold active:scale-[0.98]";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-md active:scale-90" aria-label={t("More")} data-testid="creator-more">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`@${handle}`}>
        <div className="grid gap-2 p-4 pt-1">
          <button
            type="button"
            className={row}
            onClick={async () => {
              const url = `${location.origin}/c/${handle}`;
              try {
                await navigator.clipboard.writeText(url);
                toast(t("Link copied"), "success");
              } catch {
                prompt(t("Copy this link"), url);
              }
              setOpen(false);
            }}
          >
            <Copy className="h-5 w-5" /> {t("Copy profile link")}
          </button>
          {self && (
            <>
              <Link href="/creator/profile" className={row}>
                <Pencil className="h-5 w-5" /> {t("Edit profile")}
              </Link>
              <Link href="/creator/followers" className={row}>
                <Users className="h-5 w-5" /> {t("Followers")}
              </Link>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
