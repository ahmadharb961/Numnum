"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center px-3.5 text-[15px] font-medium transition ${
        active ? "text-brand-600" : "text-ink-soft hover:text-ink"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-brand-500" />}
    </Link>
  );
}
