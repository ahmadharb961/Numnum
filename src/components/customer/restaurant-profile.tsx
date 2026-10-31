"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Grid3x3, Heart, Info, PlayCircle, Plus, Star, UtensilsCrossed } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { RatingPill, EmptyState } from "@/components/ui/misc";
import { ReelThumb } from "./cards";
import { ItemSheet } from "./item-sheet";
import { useT } from "@/i18n/client";

type Item = { id: string; name: string; description: string | null; priceCents: number; currency: string; ratingAvg: number; ratingCount: number; available: boolean; dietaryLabels: string[]; image: { url: string; thumbUrl: string | null } | null };
type Section = { id: string; name: string; items: Item[] };
type Reel = { id: string; posterUrl: string | null; viewCount: number; menuItem: { name: string } };

type Tab = "menu" | "reels" | "about" | "reviews";
const TABS: [Tab, string, typeof UtensilsCrossed][] = [
  ["menu", "Menu", UtensilsCrossed],
  ["reels", "Reels", PlayCircle],
  ["about", "About", Info],
  ["reviews", "Reviews", Star],
];
const PREVIEW = 4; // items shown per section before "See all"

/**
 * Menu / Reels / About / Reviews. Links to #menu, #about or #reviews (e.g. the "Hours & contact"
 * card or "Order now") open that tab and scroll to it.
 */
export function ProfileTabs({ slug, sections, reels, orderingEnabled, about, reviews }: { slug: string; sections: Section[]; reels: Reel[]; orderingEnabled: boolean; about: React.ReactNode; reviews: React.ReactNode }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("menu");
  const [itemId, setItemId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(sections[0]?.id);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  // The bar reserves status-bar space only for when it's stuck to the top: that space overlaps
  // the content above (no gap) and is filled in once stuck.
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck((barRef.current?.getBoundingClientRect().top ?? 1) <= 0);
    onScroll();
    // Capture phase: also catches the in-app scroll container used by the installed app.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1) as Tab;
      if (!TABS.some(([k]) => k === h)) return;
      setTab(h);
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <div ref={rootRef} id="menu" className="scroll-mt-2">
      <div ref={barRef} className={cn("pointer-events-none sticky top-0 z-20", stuck && "bg-cream/95 backdrop-blur-xl")} style={{ paddingTop: "var(--safe-top)", marginTop: "calc(0px - var(--safe-top))" }}>
        <div className={cn("pointer-events-auto bg-cream/95 backdrop-blur-xl", stuck && "border-b border-black/5")}>
          <div className="container-app">
            <div className="grid grid-cols-4 rounded-2xl bg-white px-1 shadow-[0_1px_2px_rgba(22,18,15,0.05),0_6px_20px_rgba(22,18,15,0.05)]" role="tablist">
              {TABS.map(([k, label, Icon]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("relative flex h-12 items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-bold transition sm:text-sm", tab === k ? "text-brand-600" : "text-ink-muted")}>
                  <Icon className="h-[18px] w-[18px]" /> {t(label)}
                  {tab === k && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-brand-500" />}
                </button>
              ))}
            </div>
          </div>
          {tab === "menu" && sections.length > 1 && (
            <div className="no-scrollbar container-app flex gap-2 overflow-x-auto py-3 lg:flex-wrap lg:overflow-visible">
              {sections.map((s) => (
                <a key={s.id} href={`#sec-${s.id}`} onClick={() => setActiveSection(s.id)} className={cn("chip h-9 shrink-0 px-4", activeSection === s.id && "chip-active")}>
                  {s.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "menu" && (
        <div className="container-app pt-3">
          {sections.length === 0 && <EmptyState icon={<UtensilsCrossed />} title={t("Menu coming soon")} />}
          {sections.map((s) => {
            const all = expanded.has(s.id);
            const items = all ? s.items : s.items.slice(0, PREVIEW);
            return (
              <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-36 pb-5">
                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <h2 className="text-xl font-black tracking-tight">{s.name}</h2>
                  {s.items.length > PREVIEW && (
                    <button type="button" onClick={() => setExpanded((e) => { const n = new Set(e); if (all) n.delete(s.id); else n.add(s.id); return n; })} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-600">
                      {all ? t("Show less") : t("See all ({n})", { n: s.items.length })}
                      <ChevronRight className={cn("h-4 w-4 transition rtl:-scale-x-100", all && "-rotate-90 rtl:rotate-90")} />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {items.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[0_1px_2px_rgba(22,18,15,0.05),0_6px_20px_rgba(22,18,15,0.05)]">
                      <button onClick={() => setItemId(i.id)} className="relative h-[92px] w-[110px] shrink-0 overflow-hidden rounded-xl bg-black/5" aria-label={t("View {name}", { name: i.name })}>
                        {i.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.image.thumbUrl ?? i.image.url} alt={i.name} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="grid h-full place-items-center text-3xl">🍽️</span>
                        )}
                        {!i.available && <span className="absolute inset-0 grid place-items-center bg-white/70 text-[11px] font-bold text-ink-soft">{t("Unavailable")}</span>}
                      </button>
                      <button onClick={() => setItemId(i.id)} className="min-w-0 flex-1 text-start">
                        <div className="line-clamp-1 text-[15px] font-bold">{i.name}</div>
                        {i.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-muted">{i.description}</p>}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="tabular text-[15px] font-extrabold">{formatMoney(i.priceCents, i.currency)}</span>
                          {i.ratingCount > 0 && <RatingPill avg={i.ratingAvg} count={i.ratingCount} />}
                        </div>
                      </button>
                      {i.available && orderingEnabled && (
                        <button onClick={() => setItemId(i.id)} className="me-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 active:scale-90" aria-label={t("Add {name}", { name: i.name })}>
                          <Plus className="h-6 w-6" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {tab === "reels" &&
        (reels.length ? (
          <div className="container-app pt-3">
            <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
              {reels.map((r) => (
                <ReelThumb key={r.id} href={`/r/${slug}/reels/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} label={r.menuItem.name} />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={<Grid3x3 />} title={t("No reels yet")} body={t("Check back soon for videos from this kitchen.")} />
        ))}
      {tab === "about" && <div className="container-app pt-3">{about}</div>}
      {tab === "reviews" && <div className="container-app pt-3">{reviews}</div>}
      <ItemSheet itemId={itemId} open={!!itemId} onClose={() => setItemId(null)} />
    </div>
  );
}

export function ShareButton({ title, path, className, children }: { title: string; path: string; className?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <button
      className={className}
      onClick={async () => {
        const url = location.origin + path;
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            alert(t("Link copied"));
          }
        } catch {}
      }}
    >
      {children}
    </button>
  );
}

export function SaveToggle({ type, refId, initial, className, heart }: { type: "RESTAURANT" | "ITEM"; refId: string; initial: boolean; className?: string; heart?: boolean }) {
  const t = useT();
  const [saved, setSaved] = useState(initial);
  return (
    <button
      className={className}
      aria-label={saved ? t("Saved") : t("Save")}
      aria-pressed={saved}
      onClick={async () => {
        setSaved(!saved);
        const res = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, refId }) });
        if (res.ok) setSaved((await res.json()).saved);
        else setSaved(saved);
      }}
    >
      {heart ? <Heart className={cn("h-5 w-5 transition", saved ? "fill-brand-500 text-brand-500" : "text-ink")} /> : saved ? t("Saved") : t("Save")}
    </button>
  );
}
