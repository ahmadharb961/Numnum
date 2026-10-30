"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Compass, Home, ShoppingBag, Store, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./cart";
import { LocationChip } from "./location-picker";
import { Logo } from "@/components/logo";

type Category = { slug: string; name: string; emoji: string | null; imageUrl: string | null };

const NAV = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/reel/") },
  { href: "/explore", label: "Explore", icon: Compass, match: (p: string) => p.startsWith("/explore") || p.startsWith("/category") },
  { href: "/restaurants", label: "Restaurants", icon: Store, match: (p: string) => p.startsWith("/restaurants") || p.startsWith("/r/") },
  { href: "/saved", label: "Saved", icon: Bookmark, match: (p: string) => p.startsWith("/saved") },
  { href: "/cart", label: "Cart", icon: ShoppingBag, match: (p: string) => p.startsWith("/cart") || p.startsWith("/checkout") },
  { href: "/account", label: "Account", icon: User, match: (p: string) => p.startsWith("/account") || p.startsWith("/order/") },
];

const FILTERS: [label: string, param: string][] = [
  ["Delivers to me", "delivery"],
  ["Pickup", "pickup"],
  ["Verified restaurants", "verified"],
  ["Rated 4+", "minRating"],
];

/** Desktop navigation (lg+): replaces the bottom tab bar, adds categories and quick filters. */
export function DesktopSidebar({ categories, locationLabel }: { categories: Category[]; locationLabel: string | null }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const { count } = useCart();
  const onExplore = pathname.startsWith("/explore");
  const exploreHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(onExplore ? sp.toString() : "");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const q = next.toString();
    return `/explore${q ? `?${q}` : ""}`;
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-black/5 bg-white lg:flex">
      <div className="px-6 pb-4 pt-6">
        <Link href="/" className="inline-block text-brand-600" aria-label="numnum home">
          <Logo className="h-7" />
        </Link>
        <div className="mt-4">
          <LocationChip label={locationLabel} className="max-w-full border border-black/10 shadow-none" />
        </div>
      </div>
      <nav className="px-3" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link key={href} href={href} className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition", active ? "bg-brand-50 text-brand-600" : "text-ink-soft hover:bg-black/5")} aria-current={active ? "page" : undefined}>
              <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
              {label}
              {href === "/cart" && count > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{count > 99 ? "99+" : count}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="no-scrollbar mt-4 flex-1 overflow-y-auto border-t border-black/5 px-3 pb-6 pt-4">
        <h2 className="px-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Categories</h2>
        <ul className="mt-2">
          {categories.map((c) => {
            const active = onExplore && sp.get("category") === c.slug;
            return (
              <li key={c.slug}>
                <Link href={exploreHref({ category: active ? null : c.slug })} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition", active ? "bg-ink text-white" : "text-ink-soft hover:bg-black/5")}>
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 rounded-full" />
                  ) : (
                    <span className="w-6 text-center text-base">{c.emoji}</span>
                  )}
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
        <h2 className="mt-5 px-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Filters</h2>
        <ul className="mt-2">
          {FILTERS.map(([label, param]) => {
            const value = param === "minRating" ? "4" : "1";
            const active = onExplore && sp.get(param) === value;
            return (
              <li key={param}>
                <Link href={exploreHref({ [param]: active ? null : value })} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition", active ? "bg-ink text-white" : "text-ink-soft hover:bg-black/5")}>
                  <span className={cn("grid h-4 w-4 place-items-center rounded border", active ? "border-white bg-white text-ink" : "border-black/25")}>{active && "✓"}</span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
