"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronLeft, Eye, Heart, Loader2, MapPin, Play, Plus, Send, Volume2, VolumeX, RotateCcw, X } from "lucide-react";
import type { PublicReel } from "@/server/feed";
import { formatMoney } from "@/lib/money";
import { cn, compactNumber } from "@/lib/utils";
import { VerifiedBadge, RatingPill } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ItemSheet } from "./item-sheet";
import { api, track } from "./track";
import { HlsVideo } from "@/components/hls-video";
import { pooledVideo, unlockPooledVideos } from "./video-pool";
import { LocationChip } from "./location-picker";
import { formatKm } from "@/lib/geo";
import { Logo } from "@/components/logo";

export type FeedReel = PublicReel & { liked?: boolean; saved?: boolean };

type Props = {
  initial: FeedReel[];
  initialCursor: number | null;
  minViewMs: number;
  /** When set, the feed is a fixed list (e.g. a restaurant's reels) and shows a back button. */
  fixed?: boolean;
  startIndex?: number;
  excludeIds?: string[];
  backHref?: string;
  locationLabel?: string | null;
};

export function ReelFeed({ initial, initialCursor, minViewMs, fixed, startIndex = 0, excludeIds = [], backHref, locationLabel = null }: Props) {
  const router = useRouter();
  const [reels, setReels] = useState<FeedReel[]>(initial);
  const [cursor, setCursor] = useState<number | null>(fixed ? null : initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [active, setActive] = useState(startIndex);
  // Sound on by default. Browsers block sound until the visitor first taps the page: then the
  // reel plays muted ("soundBlocked") and the first tap turns sound on. A manual mute is remembered.
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const unlockedAt = useRef(0);
  const [sheet, setSheet] = useState<{ itemId: string; reelId: string } | null>(null);
  const [panel, setPanel] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Jump to deep-linked index once
  useEffect(() => {
    if (startIndex > 0 && containerRef.current) {
      const el = containerRef.current.children[startIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    }
    track("homepage_opened");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem("nn_muted") === "1") setMuted(true);
    } catch {}
  }, []);

  const toggleMute = () => {
    setMuted((m) => {
      try {
        localStorage.setItem("nn_muted", m ? "0" : "1");
      } catch {}
      return !m;
    });
    setSoundBlocked(false);
  };

  // First tap/click/key after a blocked start: unmute inside the gesture. iOS only counts
  // touchend/click (not touchstart/pointerdown) and allows sound per <video> element, so all
  // pooled elements are unlocked here and every following reel plays with sound.
  useEffect(() => {
    if (!soundBlocked) return;
    let busy = false;
    const unlock = () => {
      if (busy) return;
      busy = true;
      unlockedAt.current = Date.now();
      const active = document.querySelector<HTMLVideoElement>("section[data-active='true'] video");
      void unlockPooledVideos(active).then((ok) => {
        busy = false;
        if (ok) {
          setSoundBlocked(false);
          setMuted(false);
        } else if (active) {
          active.muted = true;
          void active.play().catch(() => {});
        }
      });
    };
    const events = ["touchend", "click", "keydown"] as const;
    events.forEach((ev) => window.addEventListener(ev, unlock, { capture: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, unlock, { capture: true }));
  }, [soundBlocked]);

  // Desktop: arrow keys move between reels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=dialog]")) return;
      const root = containerRef.current;
      if (!root) return;
      e.preventDefault();
      root.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * root.clientHeight, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track which slide is visible
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.6] },
    );
    Array.from(root.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [reels.length]);

  const loadMore = useCallback(async () => {
    if (loadingMore || cursor === null) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor: String(cursor) });
      if (excludeIds.length) params.set("exclude", excludeIds.join(","));
      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { reels: FeedReel[]; nextCursor: number | null };
      setReels((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.reels.filter((r) => !seen.has(r.id))];
      });
      setCursor(data.nextCursor);
    } catch {
      toast("Couldn't load more reels. Check your connection.", "error");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, excludeIds, toast]);

  useEffect(() => {
    if (active >= reels.length - 3) void loadMore();
  }, [active, reels.length, loadMore]);

  const patch = (id: string, p: Partial<FeedReel>) => setReels((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  async function like(r: FeedReel) {
    patch(r.id, { liked: !r.liked, likeCount: r.likeCount + (r.liked ? -1 : 1) });
    try {
      const res = await api<{ liked: boolean; likeCount: number }>(`/api/reels/${r.id}/like`);
      patch(r.id, { liked: res.liked, likeCount: res.likeCount });
    } catch {
      patch(r.id, { liked: r.liked, likeCount: r.likeCount });
    }
  }

  async function save(r: FeedReel) {
    patch(r.id, { saved: !r.saved });
    try {
      const res = await api<{ saved: boolean }>("/api/save", { type: "REEL", refId: r.id });
      patch(r.id, { saved: res.saved });
      toast(res.saved ? "Saved" : "Removed from saved");
    } catch {
      patch(r.id, { saved: r.saved });
    }
  }

  async function share(r: FeedReel) {
    const url = `${location.origin}/reel/${r.id}`;
    const title = `${r.item.name} at ${r.restaurant.name}`;
    track("reel_shared", { reelId: r.id });
    patch(r.id, { shareCount: r.shareCount + 1 });
    try {
      if (navigator.share) await navigator.share({ title, text: `${title} on numnum`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(url);
          toast("Link copied");
        } catch {
          prompt("Copy this link", url);
        }
      }
    }
  }

  return (
    <div className={cn("relative bg-black text-white transition-[padding] duration-300", panel && "lg:pr-[400px]")}>
      {(fixed || backHref) && (
        <button onClick={() => (backHref ? router.push(backHref) : router.back())} className="absolute left-3 z-30 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur" style={{ top: "calc(var(--safe-top) + 12px)" }} aria-label="Back">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {!fixed && !backHref && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 lg:hidden" style={{ paddingTop: "calc(var(--safe-top) + 12px)" }}>
          <Logo className="h-9 text-white drop-shadow" />
          <span className="pointer-events-auto min-w-0">
            <LocationChip label={locationLabel} dark />
          </span>
        </div>
      )}
      {soundBlocked && (
        <button onClick={toggleMute} className={cn("absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-2 text-xs font-bold backdrop-blur")} style={{ top: "calc(var(--safe-top) + 64px)" }}>
          <VolumeX className="h-4 w-4" /> Tap for sound
        </button>
      )}
      <button onClick={toggleMute} className={cn("absolute right-3 z-30 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur", panel && "lg:right-[412px]")} style={{ top: "calc(var(--safe-top) + 12px)" }} aria-label={muted ? "Unmute" : "Mute"}>
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      <div ref={containerRef} className="h-feed snap-feed no-scrollbar overflow-y-scroll">
        {reels.map((r, i) => (
          <ReelSlide
            key={r.id}
            reel={r}
            index={i}
            active={i === active}
            near={Math.abs(i - active) <= 1}
            preloadFull={i === active || i === active + 1}
            muted={muted}
            onSoundBlocked={() => {
              setMuted(true);
              // Someone who chose mute doesn't need the "Tap for sound" prompt.
              let prefersMuted = false;
              try {
                prefersMuted = localStorage.getItem("nn_muted") === "1";
              } catch {}
              if (!prefersMuted) setSoundBlocked(true);
            }}
            justUnlocked={() => Date.now() - unlockedAt.current < 700}
            minViewMs={minViewMs}
            onLike={() => like(r)}
            onSave={() => save(r)}
            onShare={() => share(r)}
            onRestaurant={() => setPanel(true)}
            onOpen={() => setSheet({ itemId: r.item.id, reelId: r.id })}
          />
        ))}
        {reels.length === 0 && (
          <div className="grid h-feed place-items-center px-8 text-center">
            <div>
              <div className="text-5xl">🍔</div>
              <h2 className="mt-4 text-xl font-bold">No reels yet</h2>
              <p className="mt-1 text-sm text-white/70">Restaurants are cooking up their first videos. Explore menus in the meantime.</p>
              <Link href="/restaurants" className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand-500 px-5 font-semibold">
                Browse restaurants
              </Link>
            </div>
          </div>
        )}
        {loadingMore && (
          <div className="grid h-24 snap-start place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          </div>
        )}
      </div>
      <ItemSheet itemId={sheet?.itemId ?? null} reelId={sheet?.reelId} open={!!sheet} onClose={() => setSheet(null)} />
      {panel && reels[active] && <RestaurantPanel reel={reels[active]} onClose={() => setPanel(false)} onItem={(itemId) => setSheet({ itemId, reelId: reels[active].id })} />}
    </div>
  );
}

function ReelSlide({
  reel,
  index,
  active,
  near,
  preloadFull,
  muted,
  onSoundBlocked,
  justUnlocked,
  minViewMs,
  onLike,
  onSave,
  onShare,
  onRestaurant,
  onOpen,
}: {
  reel: FeedReel;
  index: number;
  active: boolean;
  near: boolean;
  preloadFull: boolean;
  muted: boolean;
  onSoundBlocked: () => void;
  justUnlocked: () => boolean;
  minViewMs: number;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onRestaurant: () => void;
  onOpen: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Pooled <video> elements exist only in the browser: attach after mount (poster shows meanwhile).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);
  const watched = useRef(0);
  const lastTick = useRef<number | null>(null);
  const viewSent = useRef(false);
  const lastTap = useRef(0);

  // Play / pause based on visibility
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && !paused) {
      v.play().catch((e: Error) => {
        // Sound before any tap is blocked: play muted instead and let the feed offer sound.
        if (e.name === "NotAllowedError" && !v.muted) {
          v.muted = true;
          onSoundBlocked();
          v.play().catch(() => setPaused(true));
          return;
        }
        // autoplay can be blocked (e.g. low-power mode); show play affordance
        setPaused(true);
      });
    } else {
      v.pause();
    }
    if (!active) {
      lastTick.current = null;
    }
  }, [active, paused, near, mounted]);

  useEffect(() => {
    if (!active) setPaused(false);
  }, [active]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Qualified view: accumulate actual playing time while visible
  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v || !active || v.paused) {
      lastTick.current = null;
      return;
    }
    const now = performance.now();
    if (lastTick.current !== null) watched.current += Math.min(1000, now - lastTick.current);
    lastTick.current = now;
    if (!viewSent.current && watched.current >= minViewMs && document.visibilityState === "visible") {
      viewSent.current = true;
      void fetch(`/api/reels/${reel.id}/view`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ watchMs: Math.round(watched.current) }), keepalive: true }).catch(() => {});
    }
  }

  function onTap() {
    // The tap that just turned sound on shouldn't also pause the reel.
    if (justUnlocked()) return;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      // double tap = like
      if (!reel.liked) onLike();
      setLikeAnim(true);
      setTimeout(() => setLikeAnim(false), 600);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setTimeout(() => {
      if (lastTap.current === now) setPaused((p) => !p);
    }, 290);
  }

  const showVideo = mounted && near && reel.videoUrl && !failed;

  return (
    <section data-index={index} data-active={active} className="relative h-feed w-full snap-start snap-always overflow-hidden bg-black lg:flex lg:items-center lg:justify-center lg:bg-[#0f0d0c]" aria-label={`${reel.item.name} by ${reel.restaurant.name}`}>
      {/* Desktop: the video plays in a centered 9:16 column. */}
      <div className="relative h-full w-full overflow-hidden lg:aspect-[9/16] lg:h-[calc(100%-2.5rem)] lg:w-auto lg:rounded-3xl">
      {/* poster always rendered underneath to avoid black frames */}
      {reel.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reel.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading={index < 2 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} />
      )}
      {showVideo && (
        <HlsVideo
          ref={videoRef}
          element={pooledVideo(index)}
          className="absolute inset-0 h-full w-full object-cover"
          src={reel.videoUrl!}
          onFatal={() => setFailed(true)}
          poster={reel.posterUrl ?? undefined}
          muted={muted}
          loop
          playsInline
          preload={preloadFull ? "auto" : "metadata"}
          onTimeUpdate={onTimeUpdate}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setBuffering(false);
            lastTick.current = performance.now();
          }}
          onPause={() => (lastTick.current = null)}
          onError={() => setFailed(true)}
        />
      )}
      <button className="absolute inset-0 z-[1] h-full w-full" onClick={onTap} aria-label={paused ? "Play" : "Pause"} />

      {active && buffering && !paused && (
        <div className="pointer-events-none absolute inset-0 z-[2] grid place-items-center">
          <Loader2 className="h-10 w-10 animate-spin text-white/80" />
        </div>
      )}
      {paused && !failed && (
        <div className="pointer-events-none absolute inset-0 z-[2] grid place-items-center">
          <Play className="h-16 w-16 fill-white/90 text-white/90 drop-shadow-lg" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 z-[2] grid place-items-center bg-black/40">
          <button
            className="flex flex-col items-center gap-2 text-sm font-semibold"
            onClick={() => {
              setFailed(false);
              setBuffering(false);
            }}
          >
            <RotateCcw className="h-8 w-8" />
            Video unavailable · Tap to retry
          </button>
        </div>
      )}
      {likeAnim && (
        <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center">
          <Heart className="h-28 w-28 animate-pop fill-brand-500 text-brand-500 drop-shadow-xl" />
        </div>
      )}

      {/* gradient for legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

      {/* Right action rail */}
      <div className="absolute bottom-6 right-2 z-10 flex flex-col items-center gap-4">
        <Link href={`/r/${reel.restaurant.slug}`} onClick={(e) => desktopPanel(e, onRestaurant)} className="relative mb-1" aria-label={`Open ${reel.restaurant.name}`}>
          <span className="block h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-white">
            {reel.restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reel.restaurant.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-brand-500 text-lg font-black">{reel.restaurant.name[0]}</span>
            )}
          </span>
        </Link>
        <RailButton onClick={onLike} label={compactNumber(reel.likeCount)} aria={reel.liked ? "Unlike" : "Like"}>
          <Heart className={cn("h-8 w-8 drop-shadow", reel.liked ? "fill-brand-500 text-brand-500" : "fill-white/10")} />
        </RailButton>
        <RailButton onClick={onSave} label={reel.saved ? "Saved" : "Save"} aria={reel.saved ? "Unsave" : "Save"}>
          <Bookmark className={cn("h-7 w-7 drop-shadow", reel.saved ? "fill-amber-400 text-amber-400" : "fill-white/10")} />
        </RailButton>
        <RailButton onClick={onShare} label={reel.shareCount ? compactNumber(reel.shareCount) : "Share"} aria="Share">
          <Send className="h-7 w-7 drop-shadow" />
        </RailButton>
        <div className="flex flex-col items-center text-[11px] font-semibold text-shadow">
          <Eye className="h-6 w-6 drop-shadow" />
          {compactNumber(reel.viewCount)}
        </div>
      </div>

      {/* Info + order (pointer-events-none on the full-width panel so it never covers the action rail) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 pr-20 *:pointer-events-auto">
        {reel.sponsored && <span className="mb-2 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur">Sponsored</span>}
        <Link href={`/r/${reel.restaurant.slug}`} onClick={(e) => desktopPanel(e, onRestaurant)} className="flex items-center gap-1.5 text-[15px] font-bold text-shadow">
          {reel.restaurant.name}
          {reel.restaurant.verified && <VerifiedBadge />}
        </Link>
        {reel.restaurant.location && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-white/80 text-shadow">
            <MapPin className="h-3.5 w-3.5" />
            {reel.restaurant.location}
            {reel.restaurant.distanceKm != null && <span>· {formatKm(reel.restaurant.distanceKm)}</span>}
            {reel.restaurant.deliversToYou === false && <span className="rounded bg-white/20 px-1.5 text-[10px] font-bold uppercase">Pickup only</span>}
          </div>
        )}
        <button onClick={onOpen} className="mt-2 block text-left">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold leading-tight text-shadow">{reel.item.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="tabular text-lg font-extrabold text-brand-300 text-shadow">{formatMoney(reel.item.priceCents, reel.item.currency)}</span>
            <RatingPill avg={reel.item.ratingAvg} count={reel.item.ratingCount} dark />
          </div>
        </button>
        {(reel.caption || reel.item.description) && <ReelCaption text={(reel.caption || reel.item.description)!} />}
        {reel.restaurant.orderingEnabled && reel.item.available ? (
          <button onClick={onOpen} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-bold shadow-lg shadow-brand-500/40 active:scale-[0.98]">
            Order · {formatMoney(reel.item.priceCents, reel.item.currency)}
          </button>
        ) : (
          <button onClick={onOpen} className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-white/15 text-sm font-bold backdrop-blur">
            {reel.item.available ? "View dish" : "Currently unavailable"}
          </button>
        )}
      </div>
      </div>
    </section>
  );
}

/** Like Instagram: one line ending in "… more"; tap to read it all, "less" folds it back. */
function ReelCaption({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setLong(el.scrollWidth > el.clientWidth + 1 || text.includes("\n"));
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  if (open)
    return (
      <div className="mt-1.5 max-h-[38vh] overflow-y-auto overscroll-contain pb-1">
        <p className="whitespace-pre-line break-words text-sm text-white/90 text-shadow" onClick={() => setOpen(false)}>
          {text}{" "}
          <button type="button" onClick={(e) => (e.stopPropagation(), setOpen(false))} className="font-semibold text-white">
            less
          </button>
        </p>
      </div>
    );
  return (
    <div className="mt-1.5 flex min-w-0 items-baseline text-sm text-shadow">
      <span ref={ref} className="min-w-0 flex-1 truncate text-white/85" onClick={() => long && setOpen(true)}>
        {text.split("\n")[0]}
      </span>
      {long && (
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 pl-1 font-semibold text-white">
          more
        </button>
      )}
    </div>
  );
}

function RailButton({ children, label, onClick, aria }: { children: React.ReactNode; label: string; onClick: () => void; aria: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5 text-[11px] font-semibold text-shadow active:scale-90" aria-label={aria}>
      {children}
      {label}
    </button>
  );
}


/** On desktop, the restaurant photo/name opens the side panel instead of leaving the reels. */
function desktopPanel(e: React.MouseEvent, open: () => void) {
  if (window.matchMedia("(min-width: 1024px)").matches) {
    e.preventDefault();
    open();
  }
}

type PanelMenu = { description: string | null; openNow: boolean | null; reelCount: number; sections: { id: string; name: string; items: { id: string; name: string; priceCents: number; currency: string; available: boolean; image: string | null }[] }[] };

/** Desktop right-hand panel (like the left sidebar): the current reel's restaurant and its menu. */
function RestaurantPanel({ reel, onClose, onItem }: { reel: FeedReel; onClose: () => void; onItem: (itemId: string) => void }) {
  const r = reel.restaurant;
  const [menu, setMenu] = useState<PanelMenu | null>(null);
  useEffect(() => {
    let cancelled = false;
    setMenu(null);
    fetch(`/api/restaurants/${r.id}/menu`)
      .then((res) => (res.ok ? res.json() : null))
      .then((m) => !cancelled && setMenu(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [r.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="fixed inset-y-0 right-0 z-40 hidden w-[400px] animate-fade-in flex-col border-l border-black/5 bg-white text-ink lg:flex" aria-label={`${r.name} menu`}>
      <div className="relative aspect-[16/9] shrink-0 bg-gradient-to-br from-brand-100 to-brand-300">
        {r.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.coverUrl} alt="" className="h-full w-full object-cover" />
        )}
        <button onClick={onClose} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <span className="absolute bottom-3 left-4 h-16 w-16 overflow-hidden rounded-2xl border-[3px] border-white bg-white shadow-lg">
          {r.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-items-center bg-brand-500 text-2xl font-black text-white">{r.name[0]}</span>
          )}
        </span>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="px-5 pb-4 pt-4">
          <div className="flex items-center gap-1.5 text-xl font-extrabold">
            {r.name}
            {r.verified && <VerifiedBadge />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <RatingPill avg={r.ratingAvg} count={r.ratingCount} />
            {r.cuisine && <span>{r.cuisine}</span>}
            {r.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {r.location}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 text-sm">
            {menu?.openNow != null && <span className={cn("font-semibold", menu.openNow ? "text-emerald-700" : "text-ink-muted")}>{menu.openNow ? "Open now" : "Closed"}</span>}
            {r.deliversToYou === true && <span className="font-semibold text-emerald-700">Delivers to you{r.distanceKm != null ? ` · ${formatKm(r.distanceKm)}` : ""}</span>}
            {r.deliversToYou === false && <span className="text-ink-muted">Pickup only for your location</span>}
            {r.avgPrepMinutes > 0 && <span className="text-ink-muted">{r.avgPrepMinutes}–{r.avgPrepMinutes + 15} mins</span>}
          </div>
          {menu?.description && <p className="mt-3 text-sm text-ink-soft">{menu.description}</p>}
          <Link href={`/r/${r.slug}`} className="mt-4 flex h-10 items-center justify-center rounded-xl border border-black/10 text-sm font-bold hover:bg-black/5">
            Open restaurant page
          </Link>
        </div>
        <div className="border-t border-black/5 px-5 pb-8 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Menu</h3>
          {!menu && (
            <div className="grid h-32 place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
            </div>
          )}
          {menu?.sections.map((s) => (
            <section key={s.id} className="mt-4">
              <h4 className="mb-2 font-extrabold">{s.name}</h4>
              <div className="space-y-1">
                {s.items.map((i) => (
                  <button key={i.id} onClick={() => onItem(i.id)} disabled={!i.available} className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-black/5 disabled:opacity-50", i.id === reel.item.id && "bg-brand-50 ring-1 ring-brand-200")}>
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/5">
                      {i.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{i.name}</span>
                      <span className="tabular text-sm font-extrabold text-brand-600">{formatMoney(i.priceCents, i.currency)}</span>
                      {i.id === reel.item.id && <span className="ml-2 text-xs font-semibold text-brand-600">In this reel</span>}
                    </span>
                    {i.available && (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white">
                        <Plus className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
