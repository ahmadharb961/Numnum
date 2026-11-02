import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { localName } from "@/i18n/core";
import { getLocale, getT } from "@/i18n/server";
import { ScrollRow } from "./scroll-row";

type Cat = { slug: string; name: string; nameAr?: string | null; emoji: string | null; imageUrl: string | null };

function Tile({ href, active, label, children }: { href: string; active: boolean; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className="group flex w-[76px] shrink-0 flex-col items-center gap-1.5 lg:w-[96px]">
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

/** Round 3D food tiles in one row that scrolls sideways (swipe on phones, arrows on desktop). */
export async function CategoryTiles({ categories, active, hrefFor }: { categories: Cat[]; active?: string; hrefFor: (slug?: string) => string }) {
  const t = await getT();
  const locale = await getLocale();
  return (
    <ScrollRow className="-mx-4 gap-1 px-4 pb-2 pt-1 lg:mx-0 lg:gap-2 lg:px-1">
      <Tile href={hrefFor()} active={!active} label={t("All")}>
        <LayoutGrid className="h-7 w-7 text-brand-500 lg:h-8 lg:w-8" />
      </Tile>
      {categories.map((c) => (
        <Tile key={c.slug} href={hrefFor(c.slug)} active={active === c.slug} label={localName(locale, c.name, c.nameAr)}>
          {c.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imageUrl} alt="" width={84} height={84} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl">{c.emoji ?? "🍽️"}</span>
          )}
        </Tile>
      ))}
    </ScrollRow>
  );
}
