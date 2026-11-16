"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Bell, LineChart, ClipboardList, CreditCard, Film, Home, Image as ImageIcon, LayoutGrid, Menu, MessageSquareText, Settings, ShieldCheck, SlidersHorizontal, Upload, Users, X, LogOut, ExternalLink, BadgePercent } from "lucide-react";
import { NewOrderAlertCompact, useOrderAlerts } from "./new-order-alert";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { useT } from "@/i18n/client";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; minRole?: "MANAGER" | "OWNER"; badge?: number };

export function DashboardNav({ restaurantName, slug, role, memberships, currentId, unread, pendingOrders }: { restaurantName: string; slug: string; role: "OWNER" | "MANAGER" | "STAFF"; memberships: { id: string; displayName: string }[]; currentId: string; unread: number; pendingOrders: number }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rank = { STAFF: 1, MANAGER: 2, OWNER: 3 }[role];
  // New orders, live (the badge follows the 10-second check, not just the page load).
  const liveOrders = useOrderAlerts()?.count ?? pendingOrders;
  // The phone's tab bar, like the customer app: the screens used all day, one tap away. Staff
  // can't open Reels, so they get Reviews there. "More" opens everything else.
  const tabs = [
    { href: "/dashboard", label: "Home", icon: Home, match: (p: string) => p === "/dashboard" },
    { href: "/dashboard/orders", label: "Orders", icon: ClipboardList, badge: liveOrders, match: (p: string) => p.startsWith("/dashboard/orders") },
    { href: "/dashboard/menu", label: "Menu", icon: LayoutGrid, match: (p: string) => p.startsWith("/dashboard/menu") || p.startsWith("/dashboard/customizations") },
    rank >= 2
      ? { href: "/dashboard/reels", label: "Reels", icon: Film, match: (p: string) => p.startsWith("/dashboard/reels") }
      : { href: "/dashboard/reviews", label: "Reviews", icon: MessageSquareText, match: (p: string) => p.startsWith("/dashboard/reviews") },
  ];
  const onTab = tabs.some((x) => x.match(pathname));
  useEffect(() => {
    // Tab screens load in the background so a tap shows them at once.
    const t = setTimeout(() => tabs.forEach((x) => router.prefetch(x.href)), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, rank]);
  useEffect(() => setOpen(false), [pathname]);
  const groups: { title: string; items: NavItem[] }[] = [
    { title: "", items: [{ href: "/dashboard", label: "Overview", icon: BarChart3 }, { href: "/dashboard/orders", label: "Orders", icon: ClipboardList, badge: liveOrders }, { href: "/dashboard/insights", label: "Insights", icon: LineChart, minRole: "MANAGER" }] },
    {
      title: "Menu",
      items: [
        { href: "/dashboard/menu", label: "Menu items", icon: LayoutGrid },
        { href: "/dashboard/customizations", label: "Customizations", icon: SlidersHorizontal, minRole: "MANAGER" },
        { href: "/dashboard/menu/import", label: "CSV import", icon: Upload, minRole: "MANAGER" },
        { href: "/dashboard/menu/photos", label: "Photos", icon: ImageIcon, minRole: "MANAGER" },
      ],
    },
    { title: "Content", items: [{ href: "/dashboard/reels", label: "Reels", icon: Film, minRole: "MANAGER" }, { href: "/dashboard/deals", label: "Deals", icon: BadgePercent, minRole: "MANAGER" }, { href: "/dashboard/reviews", label: "Reviews", icon: MessageSquareText }] },
    {
      title: "Account",
      items: [
        { href: "/dashboard/billing", label: "Billing & Commissions", icon: CreditCard, minRole: "OWNER" },
        { href: "/dashboard/settings", label: "Settings", icon: Settings, minRole: "MANAGER" },
        { href: "/dashboard/staff", label: "Staff", icon: Users, minRole: "OWNER" },
        { href: "/dashboard/verification", label: "Verification", icon: ShieldCheck, minRole: "OWNER" },
        { href: "/dashboard/notifications", label: "Notifications", icon: Bell, badge: unread },
      ],
    },
  ];
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href) && !(href === "/dashboard/menu" && /\/menu\/(import|photos)/.test(pathname)));

  const content = (
    <div className="flex h-full flex-col">
      <div className="border-b border-black/5 p-4">
        <Link href="/" className="flex items-end gap-2 text-brand-600">
          <Logo className="h-9" /> <span className="whitespace-nowrap text-xs font-bold text-ink-muted">{t("for restaurants")}</span>
        </Link>
        {memberships.length > 1 ? (
          <form action="/dashboard/switch" method="post" className="mt-3">
            <select name="restaurantId" defaultValue={currentId} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input h-10">
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <div className="mt-2 truncate text-sm font-semibold">{restaurantName}</div>
        )}
        <Link href={`/r/${slug}`} target="_blank" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          {t("View public profile")} <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {groups.map((g) => {
          const items = g.items.filter((i) => !i.minRole || rank >= { MANAGER: 2, OWNER: 3 }[i.minRole]);
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-3">
              {g.title && <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{t(g.title)}</div>}
              {items.map((i) => (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition", isActive(i.href) ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-black/[0.04]")}>
                  <i.icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{t(i.label)}</span>
                  {!!i.badge && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{i.badge}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-black/5 px-3 pt-3">
        <LanguageSwitcher className="w-full" />
      </div>
      <form action={logoutAction} className="border-t border-black/5 p-3">
        <button className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-muted hover:bg-black/[0.04]">
          <LogOut className="h-[18px] w-[18px]" /> {t("Log out")}
        </button>
      </form>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-black/5 bg-white lg:block">{content}</aside>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-black/5 bg-white/95 px-4 backdrop-blur-xl lg:hidden" style={{ paddingTop: "var(--safe-top)", height: "calc(3.5rem + var(--safe-top))" }}>
        <div className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight">{restaurantName}</div>
        <NewOrderAlertCompact />
        <Link href="/dashboard/notifications" className="relative grid h-10 w-10 place-items-center rounded-full active:scale-90" aria-label={t("Notifications")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute end-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />}
        </Link>
      </header>
      <nav className="hide-when-typing fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "var(--safe-bottom)" }} aria-label={t("Main")} data-testid="dash-tabs">
        <ul className="mx-auto grid h-[var(--nav-h)] max-w-screen-sm grid-cols-5">
          {tabs.map(({ href, label, icon: Icon, match, ...x }) => {
            const active = match(pathname);
            const badge = "badge" in x ? (x.badge as number) : 0;
            return (
              <li key={href}>
                <Link href={href} className={cn("relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95", active ? "text-brand-600" : "text-ink-muted")} aria-current={active ? "page" : undefined}>
                  <span className="relative">
                    <Icon className={cn("h-6 w-6", active && "stroke-[2.4]")} />
                    {badge > 0 && <span className="absolute -end-2.5 -top-1.5 grid h-[18px] min-w-[18px] animate-pulse place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white" data-testid="orders-badge">{badge > 99 ? "99+" : badge}</span>}
                  </span>
                  {t(label)}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} className={cn("relative flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95", !onTab || open ? "text-brand-600" : "text-ink-muted")} aria-label={t("More")} data-testid="dash-more">
              <span className="relative">
                <Menu className={cn("h-6 w-6", (!onTab || open) && "stroke-[2.4]")} />
                {unread > 0 && <span className="absolute -end-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand-500" />}
              </span>
              {t("More")}
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 animate-fade-in bg-white shadow-xl" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
            <button onClick={() => setOpen(false)} className="absolute end-3 grid h-9 w-9 place-items-center rounded-full bg-black/5" style={{ top: "calc(var(--safe-top) + 12px)" }} aria-label={t("Close menu")}>
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
