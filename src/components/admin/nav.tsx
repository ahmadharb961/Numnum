"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, ClipboardList, CreditCard, FileText, Flag, LayoutGrid, Menu, Scale, ScrollText, Settings, ShieldCheck, Store, Wallet, X, LogOut, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/actions/auth";
import { Logo } from "@/components/logo";

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = [
    { href: "/admin", label: "Overview", icon: BarChart3 },
    { href: "/admin/restaurants", label: "Restaurants", icon: Store, badge: counts.pendingRestaurants },
    { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck, badge: counts.verifications },
    { href: "/admin/orders", label: "Order records", icon: ClipboardList, badge: counts.suspicious },
    { href: "/admin/commissions", label: "Commissions", icon: Scale, badge: counts.pendingAdjustments },
    { href: "/admin/invoices", label: "Invoices", icon: FileText, badge: counts.overdue },
    { href: "/admin/payments", label: "Whish payments", icon: Wallet, badge: counts.payments },
    { href: "/admin/disputes", label: "Disputes", icon: CreditCard, badge: counts.disputes },
    { href: "/admin/moderation", label: "Moderation", icon: Flag, badge: counts.reports },
    { href: "/admin/categories", label: "Categories", icon: LayoutGrid },
    { href: "/admin/settings", label: "Settings", icon: Settings },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText },
    { href: "/admin/push", label: "Push notifications", icon: Megaphone },
    { href: "/admin/notifications", label: "Notifications", icon: Bell, badge: counts.notifications },
  ];
  const content = (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 p-4">
        <Link href="/admin" className="flex items-end gap-2 text-brand-400">
          <Logo className="h-5" /> <span className="text-xs font-bold text-white/60">admin</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {items.map((i) => {
          const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition", active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}>
              <i.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{i.label}</span>
              {!!i.badge && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{i.badge}</span>}
            </Link>
          );
        })}
      </nav>
      <form action={logoutAction} className="border-t border-white/10 p-3">
        <button className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/65 hover:bg-white/5">
          <LogOut className="h-[18px] w-[18px]" /> Log out
        </button>
      </form>
    </div>
  );
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-ink text-white lg:block">{content}</aside>
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-ink px-4 text-white lg:hidden" style={{ paddingTop: "var(--safe-top)", height: "calc(3.5rem + var(--safe-top))" }}>
        <button onClick={() => setOpen(true)} className="-ml-2 grid h-10 w-10 place-items-center" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
        <span className="flex items-end gap-1.5 text-brand-400"><Logo className="h-5" /> <span className="text-xs font-bold text-white/60">admin</span></span>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-ink text-white" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
            <button onClick={() => setOpen(false)} className="absolute right-3 grid h-9 w-9 place-items-center rounded-full bg-white/10" style={{ top: "calc(var(--safe-top) + 12px)" }} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
