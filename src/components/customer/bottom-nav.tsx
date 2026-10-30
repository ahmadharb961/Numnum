"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, ShoppingBag, Store, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./cart";

const items = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/reel/") },
  { href: "/explore", label: "Explore", icon: Compass, match: (p: string) => p.startsWith("/explore") || p.startsWith("/category") },
  { href: "/restaurants", label: "Restaurants", icon: Store, match: (p: string) => p.startsWith("/restaurants") || p.startsWith("/r/") },
  { href: "/cart", label: "Cart", icon: ShoppingBag, match: (p: string) => p.startsWith("/cart") || p.startsWith("/checkout") },
  // Saved items live inside Account (and in the desktop sidebar).
  { href: "/account", label: "Account", icon: User, match: (p: string) => p.startsWith("/account") || p.startsWith("/saved") || p.startsWith("/order/") },
];

export function BottomNav() {
  const pathname = usePathname();
  const { count } = useCart();
  const dark = pathname === "/" || pathname.startsWith("/reel/") || /^\/r\/[^/]+\/reels/.test(pathname);
  // The page background also colors any area iOS leaves around the app (e.g. below the nav).
  useEffect(() => {
    document.body.style.backgroundColor = dark ? "#000" : "";
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [dark]);
  return (
    <nav
      className={cn("fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-xl lg:hidden", dark ? "border-white/10 bg-black/90 text-white" : "border-black/5 bg-white/95 text-ink")}
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="Main"
    >
      <ul className="mx-auto grid h-[var(--nav-h)] max-w-screen-sm grid-cols-5">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link href={href} className={cn("relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition", active ? (dark ? "text-white" : "text-brand-600") : dark ? "text-white/55" : "text-ink-muted")} aria-current={active ? "page" : undefined}>
                <span className="relative">
                  <Icon className={cn("h-6 w-6", active && "stroke-[2.4]")} />
                  {href === "/cart" && count > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
