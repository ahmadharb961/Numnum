import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

type Cat = { slug: string; name: string; emoji: string | null; imageUrl: string | null };

function Tile({ href, active, label, children }: { href: string; active: boolean; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className="group flex w-[76px] shrink-0 flex-col items-center gap-1.5 lg:w-auto">
      <span
        className={cn(
          "grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full bg-white shadow-[0_2px_4px_rgba(22,18,15,0.06),0_8px_18px_rgba(22,18,15,0.08)] ring-2 transition group-hover:-translate-y-0.5 group-active:scale-95 lg:h-[84px] lg:w-[84px]",
          active ? "ring-brand-500" : "ring-transparent",
        )}
      >
        {children}
      </span>
      <span className={cn("line-clamp-2 text-center text-xs leading-tight", active ? "font-bold text-brand-600" : "font-semibold text-ink-soft")}>{label}</span>
    </Link>
  );
}

/** Round 3D food tiles: scroll sideways on phones, wrap into rows on desktop. */
export function CategoryTiles({ categories, active, hrefFor }: { categories: Cat[]; active?: string; hrefFor: (slug?: string) => string }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 pt-1 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] lg:gap-x-2 lg:gap-y-4 lg:overflow-visible lg:px-0">
      <Tile href={hrefFor()} active={!active} label="All">
        <LayoutGrid className="h-7 w-7 text-brand-500 lg:h-8 lg:w-8" />
      </Tile>
      {categories.map((c) => (
        <Tile key={c.slug} href={hrefFor(c.slug)} active={active === c.slug} label={c.name}>
          {c.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imageUrl} alt="" width={84} height={84} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl">{c.emoji ?? "🍽️"}</span>
          )}
        </Tile>
      ))}
    </div>
  );
}
