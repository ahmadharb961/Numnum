"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/payments", label: "Payments", badge: "payments" },
  { href: "/admin/tasks", label: "Tasks", badge: "tasks" },
  { href: "/admin/reports", label: "Reports", badge: "reports" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function AdminNav({ badges }: { badges: Record<"payments" | "tasks" | "reports", number> }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Admin">
      <ul className="flex w-max gap-1.5 rounded-full bg-lavender p-1.5">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
          const n = "badge" in t ? badges[t.badge] : 0;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active ? "bg-white text-brand-700 shadow-card" : "text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
                {n > 0 && (
                  <span className="rounded-full bg-coral px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{n}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
