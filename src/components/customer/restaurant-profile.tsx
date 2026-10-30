"use client";

import { useEffect, useRef, useState } from "react";
import { Grid3x3, Plus, UtensilsCrossed } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { RatingPill, EmptyState } from "@/components/ui/misc";
import { ReelThumb } from "./cards";
import { ItemSheet } from "./item-sheet";

type Item = { id: string; name: string; description: string | null; priceCents: number; currency: string; ratingAvg: number; ratingCount: number; available: boolean; dietaryLabels: string[]; image: { url: string; thumbUrl: string | null } | null };
type Section = { id: string; name: string; items: Item[] };
type Reel = { id: string; posterUrl: string | null; viewCount: number; menuItem: { name: string } };

export function ProfileTabs({ slug, sections, reels, orderingEnabled }: { slug: string; sections: Section[]; reels: Reel[]; orderingEnabled: boolean }) {
  const [tab, setTab] = useState<"menu" | "reels">("menu");
  const [itemId, setItemId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(sections[0]?.id);
  // The bar reserves status-bar space only for when it's stuck to the top: that space overlaps
  // the content above (no gap) and is filled in once stuck.
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck((barRef.current?.getBoundingClientRect().top ?? 1) <= 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div>
      <div ref={barRef} className={cn("pointer-events-none sticky top-0 z-20", stuck && "bg-cream/95 backdrop-blur-xl")} style={{ paddingTop: "var(--safe-top)", marginTop: "calc(0px - var(--safe-top))" }}>
        <div className="pointer-events-auto border-b border-black/5 bg-cream/95 backdrop-blur-xl">
          <div className="container-app grid grid-cols-2" role="tablist">
            {(
              [
                ["menu", "Menu", UtensilsCrossed],
                ["reels", "Reels", Grid3x3],
              ] as const
            ).map(([k, label, Icon]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("flex h-12 items-center justify-center gap-2 border-b-2 text-sm font-bold transition", tab === k ? "border-ink text-ink" : "border-transparent text-ink-muted")}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {tab === "menu" && sections.length > 1 && (
            <div className="no-scrollbar container-app flex gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible py-2">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#sec-${s.id}`}
                  onClick={() => setActiveSection(s.id)}
                  className={cn("chip h-8 text-xs", activeSection === s.id && "chip-active")}
                >
                  {s.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "menu" ? (
        <div className="container-app pt-3">
          {sections.length === 0 && <EmptyState icon={<UtensilsCrossed />} title="Menu coming soon" />}
          {sections.map((s) => (
            <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-32 pb-4">
              <h2 className="mb-2 text-lg font-extrabold">{s.name}</h2>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {s.items.map((i) => (
                  <div key={i.id} className="card flex gap-3 p-2.5">
                    <button onClick={() => setItemId(i.id)} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black/5" aria-label={`View ${i.name}`}>
                      {i.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.image.thumbUrl ?? i.image.url} alt={i.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="grid h-full place-items-center text-3xl">🍽️</span>
                      )}
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <button onClick={() => setItemId(i.id)} className="text-left">
                        <div className="line-clamp-1 font-bold">{i.name}</div>
                        {i.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{i.description}</p>}
                      </button>
                      <div className="mt-auto flex items-center justify-between pt-1.5">
                        <div className="flex items-center gap-2">
                          <span className="tabular font-extrabold text-brand-600">{formatMoney(i.priceCents, i.currency)}</span>
                          <RatingPill avg={i.ratingAvg} count={i.ratingCount} />
                        </div>
                        {i.available ? (
                          orderingEnabled && (
                            <button onClick={() => setItemId(i.id)} className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-white shadow-md shadow-brand-500/30 active:scale-90" aria-label={`Add ${i.name}`}>
                              <Plus className="h-5 w-5" />
                            </button>
                          )
                        ) : (
                          <span className="text-xs font-semibold text-ink-muted">Unavailable</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : reels.length ? (
        <div className="grid grid-cols-3 gap-0.5 pt-0.5">
          {reels.map((r) => (
            <ReelThumb key={r.id} href={`/r/${slug}/reels/${r.id}`} posterUrl={r.posterUrl} views={r.viewCount} label={r.menuItem.name} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Grid3x3 />} title="No reels yet" body="Check back soon for videos from this kitchen." />
      )}
      <ItemSheet itemId={itemId} open={!!itemId} onClose={() => setItemId(null)} />
    </div>
  );
}

export function ShareButton({ title, path, className, children }: { title: string; path: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      className={className}
      onClick={async () => {
        const url = location.origin + path;
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            alert("Link copied");
          }
        } catch {}
      }}
    >
      {children}
    </button>
  );
}

export function SaveToggle({ type, refId, initial, className }: { type: "RESTAURANT" | "ITEM"; refId: string; initial: boolean; className?: string }) {
  const [saved, setSaved] = useState(initial);
  return (
    <button
      className={className}
      onClick={async () => {
        setSaved(!saved);
        const res = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, refId }) });
        if (res.ok) setSaved((await res.json()).saved);
        else setSaved(saved);
      }}
    >
      {saved ? "Saved" : "Save"}
    </button>
  );
}
