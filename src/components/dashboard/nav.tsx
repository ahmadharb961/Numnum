"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, LineChart, ClipboardList, CreditCard, Film, Image as ImageIcon, LayoutGrid, Menu, MessageSquareText, Settings, ShieldCheck, SlidersHorizontal, Upload, Users, X, LogOut, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/actions/auth";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; minRole?: "MANAGER" | "OWNER"; badge?: number };

export function DashboardNav({ restaurantName, slug, role, memberships, currentId, unread, pendingOrders }: { restaurantName: string; slug: string; role: "OWNER" | "MANAGER" | "STAFF"; memberships: { id: string; displayName: string }[]; currentId: string; unread: number; pendingOrders: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rank = { STAFF: 1, MANAGER: 2, OWNER: 3 }[role];
  const groups: { title: string; items: NavItem[] }[] = [
    { title: "", items: [{ href: "/dashboard", label: "Overview", icon: BarChart3 }, { href: "/dashboard/orders", label: "Orders", icon: ClipboardList, badge: pendingOrders }, { href: "/dashboard/insights", label: "Insights", icon: LineChart, minRole: "MANAGER" }] },
    {
      title: "Menu",
      items: [
        { href: "/dashboard/menu", label: "Menu items", icon: LayoutGrid },
        { href: "/dashboard/customizations", label: "Customizations", icon: SlidersHorizontal, minRole: "MANAGER" },
        { href: "/dashboard/menu/import", label: "CSV import", icon: Upload, minRole: "MANAGER" },
        { href: "/dashboard/menu/photos", label: "Photos", icon: ImageIcon, minRole: "MANAGER" },
      ],
    },
    { title: "Content", items: [{ href: "/dashboard/reels", label: "Reels", icon: Film, minRole: "MANAGER" }, { href: "/dashboard/reviews", label: "Reviews", icon: MessageSquareText }] },
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
        <Link href="/" className="text-xl font-black tracking-tight text-brand-600">
          numnum <span className="text-xs font-bold text-ink-muted">for restaurants</span>
        </Link>
        {memberships.length > 1 ? (
          <form action="/dashboard/switch" method="post" className="mt-3">
            <select name="restaurantId" defaultValue={currentId} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input h-10 text-sm">
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
          View public profile <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {groups.map((g) => {
          const items = g.items.filter((i) => !i.minRole || rank >= { MANAGER: 2, OWNER: 3 }[i.minRole]);
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-3">
              {g.title && <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{g.title}</div>}
              {items.map((i) => (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition", isActive(i.href) ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-black/[0.04]")}>
                  <i.icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{i.label}</span>
                  {!!i.badge && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{i.badge}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      <form action={logoutAction} className="border-t border-black/5 p-3">
        <button className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-muted hover:bg-black/[0.04]">
          <LogOut className="h-[18px] w-[18px]" /> Log out
        </button>
      </form>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/5 bg-white lg:block">{content}</aside>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-black/5 bg-white/95 px-4 backdrop-blur lg:hidden" style={{ paddingTop: "var(--safe-top)", height: "calc(3.5rem + var(--safe-top))" }}>
        <button onClick={() => setOpen(true)} className="-ml-2 grid h-10 w-10 place-items-center" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 truncate font-bold">{restaurantName}</div>
        <Link href="/dashboard/notifications" className="relative grid h-10 w-10 place-items-center" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />}
        </Link>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in bg-white shadow-xl" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
            <button onClick={() => setOpen(false)} className="absolute right-3 grid h-9 w-9 place-items-center rounded-full bg-black/5" style={{ top: "calc(var(--safe-top) + 12px)" }} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
